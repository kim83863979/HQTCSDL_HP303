DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.products WHERE image_url IS NOT NULL
    ) THEN
        RAISE EXCEPTION
            'Rollback refused: products.image_url contains image paths; remove or archive them before dropping the column';
    END IF;
END;
$$;

ALTER TABLE public.products DROP COLUMN image_url;
