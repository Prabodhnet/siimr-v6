import React, { useState } from 'react';
import {
  Smartphone,
  Download,
  Copy,
  Check,
  X,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  Layers,
  ArrowRight
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallModal: React.FC<InstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isAndroid, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [activeStep, setActiveStep] = useState(1);

  if (!isOpen) return null;

  const currentOrigin =
    typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost')
      ? window.location.origin
      : 'https://ais-pre-vusvt56yllaeezfjcuo5tn-320741551793.asia-southeast1.run.app';
  const appUrl = currentOrigin;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&bgcolor=0E0C1E&color=E2DCFF&data=${encodeURIComponent(
    appUrl
  )}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  };

  const handleNativeInstall = async () => {
    const success = await install();
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-[#0E0C1E] text-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-white/15 max-h-[90vh] overflow-y-auto space-y-5 font-sans-ui">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-linear-to-tr from-[#5438FF] to-[#8B7BFF] p-0.5 shadow-lg shadow-[#5438FF]/30 flex items-center justify-center overflow-hidden">
              <img src="/pwa-192x192.png" alt="siimr icon" className="w-full h-full object-cover rounded-[14px]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif-dream text-xl font-bold text-white tracking-tight">
                  Install siimr
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#5438FF]/30 text-[#A594FF] border border-[#5438FF]/40">
                  Android App
                </span>
              </div>
              <p className="text-xs text-white/60">
                Standalone PWA • Full-Screen • Offline Ready
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1-Tap Native Install (if Chrome already triggered beforeinstallprompt) */}
        {isInstallable && (
          <div className="p-4 rounded-2xl bg-linear-to-r from-[#5438FF]/30 to-[#7064F6]/20 border border-[#5438FF]/50 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#8B7BFF] animate-pulse" />
              <span className="font-bold text-sm text-white">
                Direct Android Install Available!
              </span>
            </div>
            <p className="text-xs text-white/80">
              Your browser is ready to add siimr to your home screen right now with one tap.
            </p>
            <button
              onClick={handleNativeInstall}
              className="w-full py-3 px-4 rounded-xl bg-[#5438FF] hover:bg-[#482ee6] active:scale-98 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#5438FF]/40 transition"
            >
              <Download className="w-4 h-4" />
              <span>Tap to Install on this Device</span>
            </button>
          </div>
        )}

        {/* Status: Already Installed */}
        {isInstalled && (
          <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2.5">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>siimr is running in standalone installed app mode on this device.</span>
          </div>
        )}

        {/* Android Installation Guide */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#A594FF] flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" /> How to Install on Android
            </span>
            <span className="text-[11px] text-white/50">Google Chrome</span>
          </div>

          <div className="space-y-2.5 text-xs">
            {/* Step 1 */}
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#5438FF] text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                1
              </div>
              <div className="flex-1 space-y-2">
                <p className="font-semibold text-white/90">
                  Open the app link in <span className="text-[#8B7BFF] font-bold">Google Chrome</span> on your Android phone:
                </p>
                <div className="flex items-center gap-2 bg-black/40 p-2 rounded-lg border border-white/10">
                  <span className="truncate text-[11px] text-white/70 font-mono flex-1">
                    {appUrl}
                  </span>
                  <button
                    onClick={handleCopyLink}
                    className="px-2.5 py-1 rounded bg-[#5438FF] hover:bg-[#482ee6] text-white text-[11px] font-bold flex items-center gap-1 shrink-0 transition"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#5438FF] text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                2
              </div>
              <div className="flex-1">
                <p className="font-semibold text-white/90">
                  Tap the Chrome menu button:
                </p>
                <p className="text-white/60 mt-0.5">
                  Tap the <span className="font-bold text-white bg-white/10 px-1.5 py-0.5 rounded">⋮ (three vertical dots)</span> in the top right corner of Chrome.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#5438FF] text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                3
              </div>
              <div className="flex-1">
                <p className="font-semibold text-white/90">
                  Select <span className="text-[#8B7BFF] font-bold">"Install app"</span> or <span className="text-[#8B7BFF] font-bold">"Add to Home screen"</span>
                </p>
                <p className="text-white/60 mt-0.5">
                  Chrome will show a popup previewing the <span className="text-white font-medium">siimr</span> app icon.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#5438FF] text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                4
              </div>
              <div className="flex-1">
                <p className="font-semibold text-white/90">
                  Tap <span className="text-emerald-400 font-bold">"Install"</span>
                </p>
                <p className="text-white/60 mt-0.5">
                  The app will download to your Android phone and appear on your home screen and in your app drawer just like an APK / Play Store app!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* QR Code for Fast Phone Access */}
        <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex flex-col items-center text-center gap-3">
          <span className="text-xs font-bold text-white/80 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-[#8B7BFF]" />
            Scan with your Android Camera
          </span>
          <div className="p-3 bg-[#0E0C1E] border border-white/20 rounded-2xl shadow-inner">
            <img
              src={qrCodeUrl}
              alt="Scan QR code to install on Android"
              className="w-36 h-36 rounded-lg object-contain"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
          <p className="text-[11px] text-white/50 max-w-[280px]">
            Point your Android camera at this code to open and install instantly in Chrome.
          </p>
        </div>

        {/* PWA Benefits */}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-white/70 pt-1">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>No Play Store login needed</span>
          </div>
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#8B7BFF] shrink-0" />
            <span>Full-screen app view</span>
          </div>
        </div>

        {/* Done / Open Link Button */}
        <div className="flex items-center gap-2 pt-2">
          <a
            href={appUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition text-center"
          >
            <span>Open in New Tab</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl bg-[#5438FF] hover:bg-[#482ee6] active:scale-98 text-white font-bold text-xs flex items-center justify-center transition"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
