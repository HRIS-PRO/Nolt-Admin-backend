
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
        const { loan_id, document_type } = req.body;

        // Safely access user ID, defaulting to null if guest (for now, to prevent crash)
        // @ts-ignore
        const userId = req.user ? req.user.id : null;
        // @ts-ignore
        const userRole = req.user ? req.user.role : 'guest';

        if (!file || !loan_id || !document_type) {
            return res.status(400).json({ message: "Missing file, loan_id, or document_type" });
        }

        // Determine if this is a staff upload
        const isStaff = userRole === 'admin' || userRole === 'staff';

        // Generate a unique path: loan_{id}/{timestamp}_{filename}
        const timestamp = Date.now();
        const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const path = `loan_${loan_id}/${timestamp}_${safeFilename}`;

        // Determine if loan_id is actual ID (number) or draft ID (string starting with L-)
        let finalLoanId: number | null = null;
        let finalDraftId: string | null = null;

        const loanIdStr = String(loan_id);
        if (loanIdStr.startsWith('L-') || isNaN(parseInt(loanIdStr))) {
            finalDraftId = loanIdStr;
        } else {
            finalLoanId = parseInt(loanIdStr);
        }

        // Upload to Supabase (with compression)
        const uploadResult = await uploadFile(file, path);

        // Record in Database
        const [doc] = await sql`
            INSERT INTO loan_documents (
                loan_id, draft_id, document_type, file_url, file_path, 
                file_name, mime_type, size_bytes, 
                uploaded_by_user_id, is_staff_upload
            ) VALUES (
                ${finalLoanId}, ${finalDraftId}, ${document_type}, ${uploadResult.url}, ${uploadResult.path},
                ${file.originalname}, ${uploadResult.mimeType}, ${uploadResult.size},
                ${userId}, ${isStaff}
            )
            RETURNING *
        `;

        res.status(201).json({
            message: "File uploaded successfully",
            document: doc
        });

    } catch (error) {
        console.error("Upload failed:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

export default router;
