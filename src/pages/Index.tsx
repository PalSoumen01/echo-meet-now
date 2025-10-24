import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Video, Plus, LogOut, Phone, Users } from "lucide-react";
import CallHistory from "@/components/CallHistory";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [roomName, setRoomName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [rooms, setRooms] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [receiverEmail, setReceiverEmail] = useState("");

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
      fetchRooms();
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setUser(session.user);
        fetchRooms();
      } else {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchRooms = async () => {
    const { data } = await supabase
      .from("rooms")
      .select("*")
      .eq("is_active", true)
      .eq("call_type", "group")
      .order("created_at", { ascending: false });

    if (data) {
      setRooms(data);
    }
  };

  const createRoom = async () => {
    if (!roomName.trim()) {
      toast({
        title: "Room name required",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await supabase
      .from("rooms")
      .insert({ 
        name: roomName, 
        host_id: user.id,
        call_type: "group",
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Error creating room",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    navigate(`/room/${data.id}`);
  };

  const startDirectCall = async () => {
    if (!receiverEmail.trim()) {
      toast({
        title: "Email required",
        variant: "destructive",
      });
      return;
    }

    if (receiverEmail === user.email) {
      toast({
        title: "Cannot call yourself",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await supabase
      .from("direct_calls")
      .insert({
        caller_id: user.id,
        receiver_id: receiverEmail,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Error starting call",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    navigate(`/direct-call/${data.id}`);
  };

  const joinRoom = () => {
    if (!roomId.trim()) {
      toast({
        title: "Room ID required",
        variant: "destructive",
      });
      return;
    }

    navigate(`/room/${roomId}`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              VideoCall Pro
            </h1>
            <p className="text-muted-foreground mt-2">
              Secure video calling platform
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        <Tabs defaultValue="direct" className="mb-8">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
            <TabsTrigger value="direct">
              <Phone className="w-4 h-4 mr-2" />
              Direct Call
            </TabsTrigger>
            <TabsTrigger value="group">
              <Users className="w-4 h-4 mr-2" />
              Group Call
            </TabsTrigger>
          </TabsList>

          <TabsContent value="direct" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6 bg-card border-border">
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                  <Phone className="w-6 h-6" />
                  Start Direct Call
                </h2>
                <div className="space-y-4">
                  <Input
                    placeholder="Enter recipient's email"
                    value={receiverEmail}
                    onChange={(e) => setReceiverEmail(e.target.value)}
                    className="bg-background border-border"
                    type="email"
                  />
                  <Button onClick={startDirectCall} className="w-full bg-gradient-primary hover:opacity-90">
                    Start Call
                  </Button>
                </div>
              </Card>

              <CallHistory />
            </div>
          </TabsContent>

          <TabsContent value="group" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6 bg-card border-border">
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                  <Plus className="w-6 h-6" />
                  Create Group Room
                </h2>
                <div className="space-y-4">
                  <Input
                    placeholder="Enter room name"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="bg-background border-border"
                  />
                  <Button onClick={createRoom} className="w-full bg-gradient-primary hover:opacity-90">
                    Create Room
                  </Button>
                </div>
              </Card>

              <Card className="p-6 bg-card border-border">
                <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                  <Video className="w-6 h-6" />
                  Join Room
                </h2>
                <div className="space-y-4">
                  <Input
                    placeholder="Enter room ID or link"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="bg-background border-border"
                  />
                  <Button onClick={joinRoom} variant="outline" className="w-full">
                    Join Room
                  </Button>
                </div>
              </Card>
            </div>

            <Card className="p-6 bg-card border-border">
              <h2 className="text-2xl font-semibold mb-4">Available Rooms</h2>
              <div className="grid gap-4">
                {rooms.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No active rooms available
                  </p>
                ) : (
                  rooms.map((room) => (
                    <div
                      key={room.id}
                      className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors"
                    >
                      <div>
                        <h3 className="font-semibold">{room.name}</h3>
                        <p className="text-sm text-muted-foreground">Room ID: {room.id}</p>
                      </div>
                      <Button onClick={() => navigate(`/room/${room.id}`)}>
                        Join
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
