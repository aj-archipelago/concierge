import React, { createContext, useContext, useState } from 'react';
import { toast } from 'react-toastify';
import { useSubscription } from '@apollo/client';
import { SUBSCRIPTIONS } from '../graphql';

type ProgressCallback = (finalData: any) => void;

type ProgressContextType = {
  addProgressToast: (requestId: string, initialText?: string, onComplete?: ProgressCallback) => void;
  removeProgressToast: (requestId: string) => void;
};

const ProgressContext = createContext<ProgressContextType | undefined>(undefined);

function ProgressToast({ requestId, initialText, onComplete }: { 
  requestId: string, 
  initialText: string,
  onComplete?: ProgressCallback 
}) {
  const [progress, setProgress] = useState(10);
  
  const { data } = useSubscription(SUBSCRIPTIONS.REQUEST_PROGRESS, {
    variables: { requestIds: [requestId] },
  });

  React.useEffect(() => {
    const result = data?.requestProgress?.data;
    const newProgress = Math.max(
      (data?.requestProgress?.progress || 0) * 100,
      progress
    );

    setProgress(newProgress);

    if (result) {
      let finalData = result;
      try {
        finalData = JSON.parse(result);
      } catch (e) {
        // ignore json parse error
      }
      onComplete?.(finalData);
      toast.dismiss(requestId);
    }
  }, [data, requestId, onComplete]);

  return (
    <div className="min-w-[250px]">
      <div className="mb-2">
        <div className="h-2 w-full bg-gray-200 rounded-full">
          <div 
            className="h-full bg-blue-600 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="text-sm">{initialText}</div>
      {data?.requestProgress?.info && (
        <div className="text-xs text-gray-500 mt-1">
          {data.requestProgress.info}
        </div>
      )}
    </div>
  );
}

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [activeToasts] = useState(new Set<string>());

  const addProgressToast = (
    requestId: string, 
    initialText = "Processing...",
    onComplete?: ProgressCallback
  ) => {
    if (activeToasts.has(requestId)) return;
    
    activeToasts.add(requestId);
    
    toast(
      <ProgressToast 
        requestId={requestId} 
        initialText={initialText}
        onComplete={onComplete}
      />,
      {
        toastId: requestId,
        autoClose: false,
        closeOnClick: false,
        draggable: false,
        closeButton: true,
        position: "bottom-right"
      }
    );
  };

  const removeProgressToast = (requestId: string) => {
    toast.dismiss(requestId);
    activeToasts.delete(requestId);
  };

  return (
    <ProgressContext.Provider value={{ addProgressToast, removeProgressToast }}>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
} 