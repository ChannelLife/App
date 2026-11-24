import React, { useCallback, useEffect, useRef } from 'react';

interface ProposeButtonProps {
  onNormalClick: () => void;
  onLongPress: () => void;
  className?: string;
}

const LONG_PRESS_DURATION_MS = 2000;
const MAX_POINTER_DRIFT_PX = 18;

export const ProposeButton: React.FC<ProposeButtonProps> = ({
  onNormalClick,
  onLongPress,
  className = '',
}) => {
  const timerRef = useRef<number | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntilRef = useRef<number>(0);
  const keyHoldActiveRef = useRef<boolean>(false);
  const keyLongPressedRef = useRef<boolean>(false);

  const cancelHold = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPointRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const startHoldTimer = useCallback(
    (onTriggered?: () => void) => {
      cancelHold();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        startPointRef.current = null;
        suppressClickUntilRef.current = Date.now() + 1200;
        onTriggered?.();
        onLongPress();
      }, LONG_PRESS_DURATION_MS);
    },
    [cancelHold, onLongPress]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    suppressClickUntilRef.current = 0;
    startPointRef.current = { x: e.clientX, y: e.clientY };
    startHoldTimer();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!startPointRef.current) return;
    const dx = e.clientX - startPointRef.current.x;
    const dy = e.clientY - startPointRef.current.y;
    if (Math.hypot(dx, dy) > MAX_POINTER_DRIFT_PX) {
      cancelHold();
    }
  };

  const handlePointerUpOrCancel = () => {
    cancelHold();
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    cancelHold();
    if (Date.now() < suppressClickUntilRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickUntilRef.current = 0;
      return;
    }
    onNormalClick();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat || keyHoldActiveRef.current) return;
    keyHoldActiveRef.current = true;
    keyLongPressedRef.current = false;
    startHoldTimer(() => {
      keyLongPressedRef.current = true;
    });
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!keyHoldActiveRef.current) return;
    const didLongPress = keyLongPressedRef.current;
    keyHoldActiveRef.current = false;
    keyLongPressedRef.current = false;
    cancelHold();
    if (!didLongPress) {
      onNormalClick();
    }
  };

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Proponi un canale"
      className={`select-none touch-none inline-flex items-center justify-center rounded-xl bg-[#F29243] hover:bg-[#E07D2B] px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold text-[#1E2025] transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#24262B] cursor-pointer ${className}`}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
    >
      Proponi un canale
    </button>
  );
};
