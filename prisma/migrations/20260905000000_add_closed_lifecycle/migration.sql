-- Add the CLOSED operational lifecycle value. Additive + non-destructive.
-- COMPLETED now reads as "Delivered" (delivered to the client); CLOSED is the terminal state for a job
-- that is delivered AND fully settled (no outstanding balance, no blocking tasks). See docs/24 Inc 2.
ALTER TYPE "ProjectLifecycle" ADD VALUE 'CLOSED';
