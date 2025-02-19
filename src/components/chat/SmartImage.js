import React, { useRef, useEffect } from "react";

const SmartImage = ({ src, alt, onLoad, style, ...rest }) => {
  const imageRef = useRef(null);
  const currentSrcRef = useRef(src);
  const hasLoadedRef = useRef(false);
  const preloadRef = useRef(null);

  useEffect(() => {
    if (src !== currentSrcRef.current) {
      // Create a hidden preload image
      const preloader = new Image();
      preloader.style.position = 'absolute';
      preloader.style.visibility = 'hidden';
      preloader.src = src;
      
      preloader.onload = () => {
        if (imageRef.current) {
          // Remove onload temporarily to prevent scroll jumps
          const originalOnLoad = imageRef.current.onload;
          imageRef.current.onload = null;
          
          // Update the src
          imageRef.current.src = src;
          currentSrcRef.current = src;
          
          // Restore onload after a tick
          requestAnimationFrame(() => {
            imageRef.current.onload = originalOnLoad;
          });
        }
      };

      // Keep a reference to clean up
      preloadRef.current = preloader;
      document.body.appendChild(preloader);
    }

    return () => {
      // Clean up preloader if it exists
      if (preloadRef.current) {
        preloadRef.current.remove();
        preloadRef.current = null;
      }
    };
  }, [src]);

  const handleLoad = (e) => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      if (onLoad) onLoad(e);
    }
  };

  return (
    <img
      ref={imageRef}
      src={currentSrcRef.current}
      alt={alt}
      onLoad={handleLoad}
      style={{ ...style, display: 'block' }}
      {...rest}
    />
  );
};

export default React.memo(SmartImage); 