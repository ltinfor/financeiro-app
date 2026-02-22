import React from 'react';
import { motion } from 'framer-motion';
import { Box } from 'lucide-react';

const App: React.FC = () => {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4 bg-muted/30">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm"
      >
        <div className="flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Box className="h-8 w-8 text-muted-foreground" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              App Initialized
            </h1>
            <p className="text-sm text-muted-foreground">
              Ready for development. Edit <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">App.tsx</code> to start building.
            </p>
          </div>
        </div>

        <div className="border-t bg-muted/50 p-4 flex justify-center">
            <p className="text-xs text-muted-foreground">
                React • TypeScript • Tailwind • Framer Motion
            </p>
        </div>
      </motion.div>
    </div>
  );
};

export default App;