-- Create enum for call types
CREATE TYPE public.call_type AS ENUM ('one_to_one', 'group');

-- Create enum for call status
CREATE TYPE public.call_status AS ENUM ('ongoing', 'ended', 'missed');

-- Create direct_calls table for one-to-one calls
CREATE TABLE public.direct_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  status call_status NOT NULL DEFAULT 'ongoing',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  CONSTRAINT different_users CHECK (caller_id != receiver_id)
);

-- Enable RLS on direct_calls
ALTER TABLE public.direct_calls ENABLE ROW LEVEL SECURITY;

-- Users can view their own call history
CREATE POLICY "Users can view their call history"
ON public.direct_calls
FOR SELECT
USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

-- Users can create calls
CREATE POLICY "Users can create calls"
ON public.direct_calls
FOR INSERT
WITH CHECK (auth.uid() = caller_id);

-- Users can update their own calls
CREATE POLICY "Users can update their calls"
ON public.direct_calls
FOR UPDATE
USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

-- Add call_type to rooms table
ALTER TABLE public.rooms ADD COLUMN call_type call_type NOT NULL DEFAULT 'group';

-- Create room_invitations table
CREATE TABLE public.room_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL,
  invitee_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(room_id, invitee_email)
);

-- Enable RLS on room_invitations
ALTER TABLE public.room_invitations ENABLE ROW LEVEL SECURITY;

-- Users can view invitations sent to them or by them
CREATE POLICY "Users can view their invitations"
ON public.room_invitations
FOR SELECT
USING (auth.uid() = inviter_id OR invitee_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Users can create invitations for their rooms
CREATE POLICY "Users can create invitations"
ON public.room_invitations
FOR INSERT
WITH CHECK (auth.uid() = inviter_id);

-- Update room_participants policy to check invitations for group calls
DROP POLICY IF EXISTS "Users can view participants in rooms they're in" ON public.room_participants;

CREATE POLICY "Users can view participants in rooms they're in"
ON public.room_participants
FOR SELECT
USING (
  user_id = auth.uid() OR 
  room_id IN (
    SELECT room_id FROM room_participants WHERE user_id = auth.uid()
  ) OR
  room_id IN (
    SELECT room_id FROM room_invitations 
    WHERE invitee_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);

-- Enable realtime for direct_calls
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_calls;

-- Enable realtime for room_invitations
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_invitations;