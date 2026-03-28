-- Couples mode support + tie-breaking improvements
-- Adds couples_picker_id to track who picks first in couples mode (2 members)

ALTER TABLE decide_rooms ADD COLUMN IF NOT EXISTS couples_picker_id UUID;
