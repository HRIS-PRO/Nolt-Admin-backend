
import express from 'express';
import multer from 'multer';
import { uploadFile } from '../services/uploadService.js';
import sql from '../config/db.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // Store in memory for processing

/**
 * @swagger
 * /api/upload:
 *   post:
 *     summary: Upload a document for a loan
 *     tags: [Documents]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               loan_id:
 *                 type: integer
 *               document_type:
 *                 type: string
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized
 */
router.post('/', upload.single('file'), async (req, res) => {
    // if (!req.isAuthenticated()) {
    //     return res.status(401).json({ message: "Unauthorized" });
    // }

    try {
        const file = req.file;
        const { loan_id, investment_id, document_type } = req.body;

        // Safely access user ID, defaulting to null if guest (for now, to prevent crash)
        // @ts-ignore
        const userId = req.user ? req.user.id : null;
        // @ts-ignore
        const userRole = req.user ? req.user.role : 'guest';

        if (!file || (!loan_id && !investment_id) || !document_type) {
            return res.status(400).json({ message: "Missing file, loan_id/investment_id, or document_type" });
        }

        // Determine if this is a staff upload
        const isStaff = userRole === 'admin' || userRole === 'staff';

        // Context: Loan or Investment
        const contextType = loan_id ? 'loan' : 'investment';
        const contextId = loan_id || investment_id;

        // Generate a unique path: {context}_{id}/{timestamp}_{filename}
        const timestamp = Date.now();
        const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const path = `${contextType}_${contextId}/${timestamp}_${safeFilename}`;

        // Determine if ID is actual ID (number) or draft ID (string starting with L- or I-)
        let finalId: number | null = null;
        let finalDraftId: string | null = null;

        const idStr = String(contextId);
        if (idStr.startsWith('L-') || idStr.startsWith('I-') || isNaN(parseInt(idStr))) {
            finalDraftId = idStr;
        } else {
            finalId = parseInt(idStr);
        }

        // Upload to Supabase (with compression)
        const uploadResult = await uploadFile(file, path);



        // Record in Database
        let doc;
        if (contextType === 'loan') {
            [doc] = await sql`
                INSERT INTO loan_documents (
                    loan_id, draft_id, document_type, file_url, file_path, 
                    file_name, mime_type, size_bytes, 
                    uploaded_by_user_id, is_staff_upload
                ) VALUES (
                    ${finalId}, ${finalDraftId}, ${document_type}, ${uploadResult.url}, ${uploadResult.path},
                    ${file.originalname}, ${uploadResult.mimeType}, ${uploadResult.size},
                    ${userId}, ${isStaff}
                )
                RETURNING *
            `;

            // Log Activity if Staff
            if (isStaff && finalId) {
                try {
                    await sql`
                        INSERT INTO loan_activities (loan_id, user_id, action_type, description, metadata)
                        VALUES (${finalId}, ${userId}, 'document_upload', ${`Uploaded document: ${document_type}`}, ${JSON.stringify({ file_name: file.originalname, file_url: uploadResult.url })})
                    `;
                } catch (logError) {
                    console.error("Failed to log activity for upload:", logError);
                }
            }
        } else {
            // Investment Documents
            [doc] = await sql`
                INSERT INTO investment_documents (
                    investment_id, draft_id, document_type, file_url, file_path, 
                    file_name, mime_type, size_bytes, 
                    uploaded_by_user_id, is_staff_upload
                ) VALUES (
                    ${finalId}, ${finalDraftId}, ${document_type}, ${uploadResult.url}, ${uploadResult.path},
                    ${file.originalname}, ${uploadResult.mimeType}, ${uploadResult.size},
                    ${userId}, ${isStaff}
                )
                RETURNING *
            `;
        }

        res.status(201).json({
            message: "File uploaded successfully",
            document: doc
        });

    } catch (error: any) {
        console.error("Upload failed:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
});

export default router;
