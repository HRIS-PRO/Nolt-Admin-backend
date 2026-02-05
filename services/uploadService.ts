
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
                .webp({ quality: 80 }) // Convert to WebP, 80% quality
                .toBuffer();
            contentType = 'image/webp';
            path = path.replace(/\.[^/.]+$/, "") + ".webp"; // Change extension to .webp
        } catch (error) {
            console.error("Image compression failed, using original file", error);
        }
    }

    const { data, error } = await supabase.storage
        .from('nolt-storsge')
        .upload(path, buffer, {
            contentType: contentType,
            upsert: false
        });

    if (error) {
        throw error;
    }

    // Get Public URL
    const { data: publicData } = supabase.storage
        .from('nolt-storsge')
        .getPublicUrl(path);

    return {
        url: publicData.publicUrl,
        path: path,
        mimeType: contentType,
        size: buffer.length
    };
};
