import PDFDocument from 'pdfkit';
import { supabase } from '../config/supabase.js';
import axios from 'axios';

const LOGO_URL = 'https://noltfinance.s3.us-east-1.amazonaws.com/logo+updated+white.png';

export const pdfService = {
  /**
   * Generates an Indemnity Agreement PDF and uploads it to Supabase Storage.
   * Returns the public URL of the uploaded document.
   */
  generateAndUploadIndemnityPdf: async (
    customerName: string,
    primaryEmail: string,
    alternateEmail: string,
    dateString: string,
    planName: string,
    signatureBase64: string, // e.g., 'data:image/png;base64,iVBORw0KGgo...'
    investmentId: string | number
  ): Promise<string | null> => {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));

        // 1. Fetch Logo Image
        let logoBuffer: Buffer | null = null;
        try {
          const response = await axios.get(LOGO_URL, { responseType: 'arraybuffer' });
          logoBuffer = Buffer.from(response.data);
        } catch (logoErr) {
          console.error("Failed to fetch logo for PDF:", logoErr);
        }

        // 2. High-Quality Header (Dark Theme matching Investment Certificate)
        // Background Rectangle for Header
        doc.rect(0, 0, 595.28, 120).fill('#0F172A');

        if (logoBuffer) {
          doc.image(logoBuffer, 50, 40, { height: 40 });
        } else {
          doc
            .fillColor('#FFFFFF')
            .font('Helvetica-Bold')
            .fontSize(24)
            .text('NOLT', 50, 45, { characterSpacing: 2 });
        }

        doc
          .fillColor('#38BDF8') // Light blue accent
          .font('Helvetica-Bold')
          .fontSize(8)
          .text('ELECTRONIC MAIL INDEMNITY', 50, 85, { characterSpacing: 1.5 });

        // Reset for body
        doc.fillColor('#000000').font('Helvetica').fontSize(11).lineGap(4);
        doc.moveDown(8); // Move past header

        // Start Body
        doc
          .font('Helvetica-Bold')
          .fontSize(16)
          .text('ELECTRONIC MAIL INDEMNITY', { align: 'center' })
          .moveDown(2);

        doc.font('Helvetica').fontSize(11).lineGap(4);

        const safeCustomerName = customerName || '____________________';

        // Introductory paragraph
        doc.text(
          `I/We, ${safeCustomerName} (the "Customer") refer to the mandate between NOLT Finance Company Limited, (“the Company”) and the Customer governing the operation of the Customer’s account(s) and credit, investment or other transactions with the Company (the mandate).`
        ).moveDown(1);

        doc.text(
          `I/We have requested the Company to consider and/or act on our instructions and/or other requests to the Company communicated from time to time via electronic mail (email) purportedly emanating from the email address(es) shown in the table below or such other email address that the Company may subsequently agree to act upon at the Customer's request (Email Instruction(s)). IN CONSIDERATION of the Company acting upon an Email Instruction, the Customer hereby formally, unreservedly, irrevocably, and unconditionally declares and covenants as follows:`
        ).moveDown(1);

        doc.text(
          `1. That the Company is hereby authorized, in its sole discretion, to consider and/or act upon Email Instruction(s) without the necessity of any original signature(s) or conformity of the instruction with any other mandate or any inquiry on the Company's part as to the authority or identity of the person sending or purporting to send such instruction or the requirement of any other confirmation on the part of the Company.`
        ).moveDown(1);

        doc.text(
          `2. The Company shall be entitled to treat any e-notice or e-communication described above as fully authorized by and binding upon the Customer and the Company shall be entitled (but not bound) to take such steps in connection with or in reliance upon such communication as the Company may in good faith consider appropriate, whether such communication includes instruction to pay money or credit any account, or relates to the disposition of any money or documents or purports to bind the Customer to any other type of transaction or arrangement whatsoever, regardless of the nature of the transaction or arrangement or the amount of money involved. Notwithstanding, the Company may at its discretion require that a scanned copy of email instructions be duly signed in accordance with the existing mandate.`
        ).moveDown(1);

        doc.text(
          `3. In consideration of the Company acting in accordance with the term of this letter, the Customer undertakes to indemnify the Company and to keep the Company indemnified against all losses, claims, actions, proceedings, demands, costs and expenses incurred or sustained by the Company of whatever nature howsoever arising, out of or in connection with such notices, demands or other e-communication, provided that the Company acts in good faith.`
        ).moveDown(1);

        doc.text(
          `4. The terms of this letter shall remain in full force and effect unless and until the Company receives a notice of termination from the Customer in writing (or signed by a duly authorized person), save that such termination will not release the Customer from any liability under this authority and indemnity in respect of any act performed by the Company in accordance with the terms of this letter prior to the expiry of such time.`
        ).moveDown(2);

        // Required Information Box / Lines
        doc.font('Helvetica-Bold').fontSize(10).text('Email Address (This email address must be one that previously exists in the Company’s records)').moveDown(0.5);
        doc.font('Helvetica').fontSize(11).text(`Primary Email: ${primaryEmail || '____________________'}`);
        doc.text(`Alternate Email: ${alternateEmail || '____________________'}`).moveDown(2);

        // Date and Customer Name
        doc.text(`Date: ${dateString || '____________________'}`);
        doc.text(`Customer Name: ${safeCustomerName}`).moveDown(2);

        doc.text('Signature: ');
        if (signatureBase64 && signatureBase64.startsWith('data:image')) {
            const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, "");
            const signatureBuffer = Buffer.from(base64Data, 'base64');
            try {
                doc.image(signatureBuffer, {
                    fit: [200, 100],
                    align: 'center'
                });
            } catch (err) {
                console.error("Error inserting signature image to PDF:", err);
            }
        } else {
            doc.moveDown(2).text('_____________________________________');
        }

        // Finalize doc
        doc.end();

        // When PDF generation completes, upload the final buffer stream
        doc.on('end', async () => {
          try {
            const pdfData = Buffer.concat(buffers);
            const fileName = `investments/${investmentId}/indemnity_agreement_${Date.now()}.pdf`;

            const { data, error } = await supabase.storage
              .from('Nolt Storage')
              .upload(fileName, pdfData, {
                  contentType: 'application/pdf',
                  upsert: false
              });

            if (error) {
              console.error("Supabase Upload Error:", error);
              return resolve(null);
            }

            const { data: publicData } = supabase.storage
              .from('Nolt Storage')
              .getPublicUrl(fileName);

            resolve(publicData.publicUrl);
          } catch (uploadObjErr) {
            console.error("Error uploading generated PDF:", uploadObjErr);
            resolve(null);
          }
        });

      } catch (e) {
        console.error("Error generating PDF document:", e);
        resolve(null);
      }
    });
  }
};
