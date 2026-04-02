
import express from 'express';
import multer from 'multer';
import { uploadFile } from '../services/uploadService.js';
import pool from '../config/db.js';
import { getIO } from '../socket.js';

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

        console.log(`[UPLOAD DEBUG] User ${userId} (${userRole}), context: ${contextId}, type: ${contextType}, docType: ${document_type}`);

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
            const docResult = await pool.query(
                `INSERT INTO loan_documents (
                    loan_id, draft_id, document_type, file_url, file_path, 
                    file_name, mime_type, size_bytes, 
                    uploaded_by_user_id, is_staff_upload
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8,
                    $9, $10
                )
                RETURNING *`,
                [
                    finalId, finalDraftId, document_type, uploadResult.url, uploadResult.path,
                    file.originalname, uploadResult.mimeType, uploadResult.size,
                    userId, isStaff
                ]
            );
            doc = docResult.rows[0];

            // Log Activity if Staff
            if (isStaff && finalId) {
                try {
                    await pool.query(
                        `INSERT INTO loan_activities (loan_id, user_id, action_type, description, metadata)
                         VALUES ($1, $2, 'document_upload', $3, $4)`,
                        [finalId, userId, `Uploaded document: ${document_type}`, JSON.stringify({ file_name: file.originalname, file_url: uploadResult.url })]
                    );
                } catch (logError) {
                    console.error("Failed to log activity for upload:", logError);
                }
            }
        } else {
            // Investment Documents
            const docResult = await pool.query(
                `INSERT INTO investment_documents (
                    investment_id, draft_id, document_type, file_url, file_path, 
                    file_name, mime_type, size_bytes, 
                    uploaded_by_user_id, is_staff_upload
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8,
                    $9, $10
                )
                RETURNING *`,
                [
                    finalId, finalDraftId, document_type, uploadResult.url, uploadResult.path,
                    file.originalname, uploadResult.mimeType, uploadResult.size,
                    userId, isStaff
                ]
            );
            doc = docResult.rows[0];
        }

        // Real-time Update
        try {
            const io = getIO();
            io.emit('doc_uploaded', {
                loanId: finalId,
                doc,
                uploadedBy: userId
            });
        } catch (e) {
            console.error("Socket emit failed details:", e);
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

/**
 * @swagger
 * /api/upload/{id}:
 *   delete:
 *     summary: Delete a document
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [loan_id]
 *             properties:
 *               loan_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *       403:
 *         description: Unauthorized
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { loan_id } = req.body;

    // @ts-ignore
    const user = req.user as any;

    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // Permission: Admin, Super Admin, or Staff who uploaded it?
    const isPowerful = ['sales_manager', 'admin', 'super_admin', 'superadmin', 'finance'].includes(user.role);

    try {
        // 1. Find Document
        const result = await pool.query(
            `SELECT * FROM loan_documents WHERE id = $1 AND loan_id = $2`,
            [id, loan_id]
        );
        const doc = result.rows[0];

        if (!doc) {
            return res.status(404).json({ message: "Document not found." });
        }

        if (!isPowerful && doc.uploaded_by_user_id !== user.id) {
            return res.status(403).json({ message: "You are not authorized to delete this document." });
        }

        // 2. Delete from Storage
        if (doc.file_path) {
            try {
                // Dynamic import or require if not imported at top
                const { deleteFile } = await import('../services/uploadService.js');
                await deleteFile(doc.file_path);
            } catch (storageError) {
                console.error("Failed to delete from storage:", storageError);
            }
        }

        // 3. Delete from DB
        await pool.query('DELETE FROM loan_documents WHERE id = $1', [id]);

        // 4. Log Activity
        await pool.query(
            `INSERT INTO loan_activities (loan_id, user_id, action_type, description, metadata)
             VALUES ($1, $2, 'document_delete', $3, $4)`,
            [loan_id, user.id, `Deleted document: ${doc.document_type}`, JSON.stringify({ file_name: doc.file_name })]
        );

        // 5. Real-time Update
        try {
            const io = getIO();
            io.emit('doc_deleted', {
                loanId: loan_id,
                docId: id,
                deletedBy: user.email
            });
        } catch (e) {
            console.error("Socket emit failed:", e);
        }

        res.json({ message: "Document deleted successfully" });

    } catch (error) {
        console.error("Delete failed:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

export default router;
