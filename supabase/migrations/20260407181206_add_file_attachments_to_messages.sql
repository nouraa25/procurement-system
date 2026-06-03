/*
  # Add File Attachments Support to Messages

  1. Changes
    - Add `file_url` column to messages table for storing attachment URLs
    - Add `file_name` column to store original file names
    - Add `file_type` column to identify file types (image, document, etc.)
  
  2. Notes
    - Files will be stored in Supabase Storage
    - Supports images, PDFs, and other document types
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'file_url'
  ) THEN
    ALTER TABLE messages ADD COLUMN file_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'file_name'
  ) THEN
    ALTER TABLE messages ADD COLUMN file_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'file_type'
  ) THEN
    ALTER TABLE messages ADD COLUMN file_type text;
  END IF;
END $$;