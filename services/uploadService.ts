
import sharp from 'sharp';
import { supabase } from '../config/supabase.js';

export const uploadFile = async (file: Express.Multer.File, path: string) => {
    let buffer = file.buffer;
    let contentType = file.mimetype;

    // Compress Images
    if (file.mimetype.startsWith('image/')) {
        try {
            buffer = await sharp(file.buffer)
                .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }) // Max 1920px
                .jpeg({ quality: 90 }) // Convert to JPEG, 90% quality for KYC compatibility
                .toBuffer();
            contentType = 'image/jpeg';
            path = path.replace(/\.[^/.]+$/, "") + ".jpg"; // Change extension to .jpg
        } catch (error) {
            console.error("Image compression failed, using original file", error);
        }
    }

    const { data, error } = await supabase.storage
        .from('Nolt Storage')
        .upload(path, buffer, {
            contentType: contentType,
            upsert: false
        });

    if (error) {
        throw error;
    }

    // Get Public URL
    const { data: publicData } = supabase.storage
        .from('Nolt Storage')
        .getPublicUrl(path);

    return {
        url: publicData.publicUrl,
        path: path,
        mimeType: contentType,
        size: buffer.length
    };
};

export const deleteFile = async (path: string) => {
    const { data, error } = await supabase.storage
        .from('Nolt Storage')
        .remove([path]);

    if (error) {
        throw error;
    }
    return data;
};
