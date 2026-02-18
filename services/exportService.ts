
import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import { Response } from 'express';

interface CustomerData {
    id: number;
    full_name: string;
    email: string;
    phone_number?: string;
    role: string;
    is_active: boolean;
    created_at: Date;
    employer?: string;
    state_of_residence?: string;
    bvn?: string;
    nin?: string;
    date_of_birth?: string; // string or Date?
    primary_home_address?: string;
    bank_name?: string;
    account_number?: string;
    account_name?: string;
    govt_id_url?: string;
    statement_of_account_url?: string;
    proof_of_residence_url?: string;
    selfie_verification_url?: string;
    [key: string]: any;
}

export const exportService = {
    /**
     * Streams a ZIP file containing folders for each customer with their details PDF to the response.
     */
    streamCustomersZip: (res: Response, customers: CustomerData[]) => {
        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });

        // Good practice to catch warnings (ie stat failures and other non-blocking errors)
        archive.on('warning', function (err: any) {
            if (err.code === 'ENOENT') {
                console.warn(err);
            } else {
                // throw error
                throw err;
            }
        });

        // good practice to catch this error explicitly
        archive.on('error', function (err: any) {
            throw err;
        });

        // pipe archive data to the file
        archive.pipe(res);

        customers.forEach(customer => {
            // Create a safe folder name: "FullName_ID" (sanitize)
            const safeName = (customer.full_name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
            const folderName = `${safeName}_${customer.id}`;

            // Generate PDF stream for this customer
            const doc = new PDFDocument();

            // Helper to add content
            doc.fontSize(20).text('Customer Profile', { align: 'center' });
            doc.moveDown();

            doc.fontSize(14).text('Personal Information');
            doc.fontSize(10).text(`Name: ${customer.full_name || 'N/A'}`);
            doc.text(`ID: ${customer.id}`);
            doc.text(`Email: ${customer.email || 'N/A'}`);
            doc.text(`Phone: ${customer.phone_number || 'N/A'}`);
            doc.text(`Joined: ${new Date(customer.created_at).toLocaleDateString()}`);
            doc.moveDown();

            doc.fontSize(14).text('Employment & Origin');
            doc.fontSize(10).text(`Employer: ${customer.employer || 'N/A'}`);
            doc.text(`State of Residence: ${customer.state_of_residence || 'N/A'}`);
            doc.text(`Address: ${customer.primary_home_address || 'N/A'}`);
            doc.moveDown();

            doc.fontSize(14).text('Identity Verification');
            doc.fontSize(10).text(`BVN: ${customer.bvn || 'N/A'}`);
            doc.text(`NIN: ${customer.nin || 'N/A'}`);
            doc.text(`Date of Birth: ${customer.date_of_birth ? new Date(customer.date_of_birth).toLocaleDateString() : 'N/A'}`);
            doc.moveDown();

            doc.fontSize(14).text('Bank Details');
            doc.fontSize(10).text(`Bank Name: ${customer.bank_name || 'N/A'}`);
            doc.text(`Account Number: ${customer.account_number || 'N/A'}`);
            doc.text(`Account Name: ${customer.account_name || 'N/A'}`);
            doc.moveDown();

            doc.fontSize(14).text('Document Links');
            const addLink = (label: string, url?: string) => {
                if (url) {
                    doc.fontSize(10).fillColor('blue').text(label, { link: url, underline: true });
                    doc.fillColor('black'); // Reset color
                } else {
                    doc.fontSize(10).text(`${label}: N/A`);
                }
            };

            addLink('Government ID', customer.govt_id_url);
            addLink('Statement of Account', customer.statement_of_account_url);
            addLink('Proof of Residence', customer.proof_of_residence_url);
            addLink('Selfie Verification', customer.selfie_verification_url);

            doc.end();

            // Append PDF stream to the archive in the customer's folder
            archive.append(doc as any, { name: `${folderName}/CustomerDetails.pdf` });
        });

        // finalize the archive (ie we are done appending files but streams have to finish yet)
        // 'close', 'end' or 'finish' may be fired right after this call so register to them beforehand
        archive.finalize();
    }
};
