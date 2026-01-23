import { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';

export function DemoModeBanner() {
  const [isVisible, setIsVisible] = useState(() => {
    const dismissed = localStorage.getItem('demo-banner-dismissed');
    return dismissed !== 'true';
  });

  const handleDismiss = () => {
    localStorage.setItem('demo-banner-dismissed', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400 border-b border-amber-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <AlertCircle className="h-5 w-5 text-amber-900 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm md:text-base font-medium text-amber-900">
                🔒 <span className="font-bold">Demo Mode:</span> This project uses Stripe Test APIs. 
                No real payments are processed.
              </p>
              <p className="text-xs md:text-sm text-amber-800 mt-0.5">
                Use test card: <span className="font-mono font-semibold">4242 4242 4242 4242</span>
                {' '}| Exp: Any future date | CVC: Any 3 digits
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="ml-4 text-amber-900 hover:text-amber-950 transition-colors flex-shrink-0"
            aria-label="Dismiss banner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}