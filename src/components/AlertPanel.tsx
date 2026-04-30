import { motion, AnimatePresence } from 'framer-motion';
import type { Alert } from '@/lib/healthScoring';
import { AlertTriangle, AlertCircle, Info, Bell } from 'lucide-react';

interface Props {
  alerts: Alert[];
}

const iconMap = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertCircle,
};

const styleMap = {
  info: 'border-primary/20 bg-primary/5 text-primary',
  warning: 'border-warning/20 bg-warning/5 text-warning',
  critical: 'border-destructive/20 bg-destructive/5 text-destructive',
};

export default function AlertPanel({ alerts }: Props) {
  const recent = alerts.slice(-8).reverse();

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Alerts</h3>
        {recent.length > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-destructive/10 text-destructive font-bold">
            {recent.length}
          </span>
        )}
      </div>

      {recent.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs font-mono opacity-60">
          No alerts — all clear
        </div>
      )}

      <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[280px]">
        <AnimatePresence mode="popLayout">
          {recent.map((alert) => {
            const Icon = iconMap[alert.type];
            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs font-mono ${styleMap[alert.type]}`}
              >
                <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p>{alert.message}</p>
                  <p className="text-[10px] opacity-60 mt-0.5">
                    {alert.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
