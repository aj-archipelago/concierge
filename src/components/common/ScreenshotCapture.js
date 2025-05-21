import { useCallback, useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB limit
const MAX_DIMENSION = 3840; // Max width/height
const COMPRESSION_QUALITY = 0.9; // Image quality (0.0 to 1.0)

/**
 * A reusable component for capturing screenshots
 * @param {Object} props
 * @param {Function} props.onCapture - Callback when screenshot is captured, receives the image data URL
 * @param {Function} props.onError - Callback when an error occurs
 * @param {boolean} props.visible - Whether the component should be visible during capture
 * @param {string} props.displaySurface - Preferred display surface to capture ('monitor', 'window', 'browser', or 'auto')
 */
export const ScreenshotCapture = forwardRef(({ 
  onCapture, 
  onError, 
  visible = true,
  displaySurface = 'monitor' // Default to monitor for backward compatibility
}, ref) => {
  const activeStreamRef = useRef(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const startScreenCapture = useCallback(async () => {
    console.log('Starting screen capture...');
    try {
      // Request screen capture with specified preferences
      console.log('Requesting display media...');
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { 
          frameRate: 1,
          displaySurface, // Use the provided preference
          cursor: 'never' // Don't need cursor
        }
      });
      
      // Store the stream reference
      activeStreamRef.current = stream;

      // Handle stream ending (user clicks "Stop Sharing")
      stream.getVideoTracks()[0].onended = () => {
        console.log('Screen sharing stopped by user');
        activeStreamRef.current = null;
        setIsCapturing(false);
      };

      return stream;
    } catch (error) {
      console.error('Error starting screen capture:', error);
      activeStreamRef.current = null;
      setIsCapturing(false);
      
      // Handle specific error cases
      if (error.name === 'NotAllowedError') {
        throw new Error('Screen capture permission was denied. You can try again or upload an image instead.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No screen capture device found. Please check your system settings.');
      } else if (error.name === 'NotReadableError') {
        throw new Error('Unable to read from screen capture device. Please try again.');
      } else {
        throw new Error('Failed to start screen capture. Please try again or upload an image instead.');
      }
    }
  }, [displaySurface]);

  const captureFrame = useCallback(async (stream) => {
    console.log('Capturing frame from stream...');
    const track = stream.getVideoTracks()[0];
    
    // Create video element to capture frame
    const video = document.createElement('video');
    video.srcObject = stream;
    
    // Wait for video to load
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        console.log('Video metadata loaded, playing...');
        video.play();
        resolve();
      };
    });
    
    // Create canvas and calculate dimensions
    let width = video.videoWidth;
    let height = video.videoHeight;
    
    // Scale down if dimensions exceed maximum
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const aspectRatio = width / height;
      if (width > height) {
        width = MAX_DIMENSION;
        height = Math.round(width / aspectRatio);
      } else {
        height = MAX_DIMENSION;
        width = Math.round(height * aspectRatio);
      }
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    
    // Draw the video frame with scaling if needed
    ctx.drawImage(video, 0, 0, width, height);
    
    // Try different compression levels if needed
    let imageData = canvas.toDataURL('image/jpeg', COMPRESSION_QUALITY);
    let attempts = 3;
    let currentQuality = COMPRESSION_QUALITY;
    
    while (imageData.length > MAX_IMAGE_SIZE && attempts > 0) {
      currentQuality *= 0.8; // Reduce quality by 20% each attempt
      imageData = canvas.toDataURL('image/jpeg', currentQuality);
      attempts--;
      console.log(`Compressing image, attempt ${3 - attempts}, size: ${Math.round(imageData.length / 1024)}KB`);
    }
    
    if (imageData.length > MAX_IMAGE_SIZE) {
      throw new Error('Screenshot too large even after compression');
    }
    
    // Clean up
    video.remove();
    canvas.remove();
    
    return imageData;
  }, []);

  const captureScreenshot = useCallback(async () => {
    try {
      setIsCapturing(true);
      // Use existing stream or request new one
      const stream = activeStreamRef.current || await startScreenCapture();
      
      // Capture frame from stream
      const imageData = await captureFrame(stream);
      
      console.log(`Screenshot captured (size: ${Math.round(imageData.length / 1024)}KB)...`);
      
      // Call the onCapture callback with the image data
      onCapture?.(imageData);
      
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to capture screenshot');
    } finally {
      setIsCapturing(false);
    }
  }, [onCapture, onError, startScreenCapture, captureFrame]);

  // Expose the captureScreenshot function via ref
  useImperativeHandle(ref, () => ({
    captureScreenshot
  }));

  useEffect(() => {
    return () => {
      // Clean up stream if component unmounts
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(track => track.stop());
        activeStreamRef.current = null;
      }
    };
  }, []);

  // If not visible and capturing, return null
  if (!visible && isCapturing) {
    return null;
  }

  return null; // This is a non-visual component
}); 