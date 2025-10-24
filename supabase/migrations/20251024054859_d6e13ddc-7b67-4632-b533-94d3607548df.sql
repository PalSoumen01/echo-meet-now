-- Create rooms table for video calls
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- Create room_participants table to track who's in which room
CREATE TABLE public.room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(room_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rooms
CREATE POLICY "Users can view all active rooms"
  ON public.rooms FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

CREATE POLICY "Users can create rooms"
  ON public.rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their rooms"
  ON public.rooms FOR UPDATE
  TO authenticated
  USING (auth.uid() = host_id);

-- RLS Policies for room_participants
CREATE POLICY "Users can view participants in rooms they're in"
  ON public.room_participants FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    room_id IN (SELECT room_id FROM public.room_participants WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can join rooms"
  ON public.room_participants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave rooms"
  ON public.room_participants FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Enable realtime for signaling
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_participants;