import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Phone, PhoneMissed, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface CallRecord {
  id: string;
  caller_id: string;
  receiver_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

const CallHistory = () => {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCallHistory();

    const channel = supabase
      .channel("call-history")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_calls",
        },
        () => {
          fetchCallHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCallHistory = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from("direct_calls")
      .select("*")
      .or(`caller_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`)
      .order("started_at", { ascending: false })
      .limit(10);

    if (data) {
      setCalls(data);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  return (
    <Card className="p-6 bg-card border-border">
      <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
        <Clock className="w-6 h-6" />
        Call History
      </h2>
      <div className="space-y-3">
        {calls.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No call history yet</p>
        ) : (
          calls.map((call) => (
            <div
              key={call.id}
              className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors"
            >
              <div className="flex items-center gap-3">
                {call.status === "missed" ? (
                  <PhoneMissed className="w-5 h-5 text-destructive" />
                ) : (
                  <Phone className="w-5 h-5 text-primary" />
                )}
                <div>
                  <p className="font-medium capitalize">{call.status} Call</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(call.started_at)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">
                  {formatDuration(call.duration_seconds)}
                </p>
                <p className="text-xs text-muted-foreground">Duration</p>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};

export default CallHistory;
