import { Platform, Alert, AlertButton } from 'react-native';

/**
 * Cross-platform utilities for web compatibility
 */

/**
 * Show an alert that works on both native and web
 * On web, uses window.confirm for simple yes/no dialogs
 * Falls back to window.alert for informational alerts
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
): void {
  if (Platform.OS === 'web') {
    // Web implementation
    if (!buttons || buttons.length === 0) {
      // Simple alert
      window.alert(message ? `${title}\n\n${message}` : title);
      return;
    }

    if (buttons.length === 1) {
      // Single button - just show alert and call onPress
      window.alert(message ? `${title}\n\n${message}` : title);
      buttons[0].onPress?.();
      return;
    }

    if (buttons.length === 2) {
      // Two buttons - use confirm
      const cancelButton = buttons.find(b => b.style === 'cancel');
      const actionButton = buttons.find(b => b.style !== 'cancel') || buttons[1];

      const result = window.confirm(message ? `${title}\n\n${message}` : title);

      if (result) {
        actionButton.onPress?.();
      } else {
        cancelButton?.onPress?.();
      }
      return;
    }

    // More than 2 buttons - fallback to first non-cancel
    const result = window.confirm(message ? `${title}\n\n${message}` : title);
    if (result) {
      const actionButton = buttons.find(b => b.style !== 'cancel');
      actionButton?.onPress?.();
    }
  } else {
    // Native implementation
    Alert.alert(title, message, buttons);
  }
}

/**
 * Check if running in a browser environment
 */
export const isWeb = Platform.OS === 'web';

/**
 * Check if running in a native environment
 */
export const isNative = Platform.OS !== 'web';

/**
 * Share content - works on native, fallback for web
 */
export async function shareContent(content: { message: string; title?: string }): Promise<boolean> {
  if (Platform.OS === 'web') {
    // Check if Web Share API is available
    if (navigator.share) {
      try {
        await navigator.share({
          title: content.title,
          text: content.message,
        });
        return true;
      } catch (error) {
        console.log('Share cancelled or failed:', error);
        return false;
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(content.message);
        window.alert('Copied to clipboard!');
        return true;
      } catch (error) {
        console.error('Failed to copy:', error);
        return false;
      }
    }
  } else {
    // Native - use React Native Share
    const { Share } = require('react-native');
    try {
      await Share.share(content);
      return true;
    } catch (error) {
      console.error('Share failed:', error);
      return false;
    }
  }
}

/**
 * Get platform-specific storage key prefix
 * Useful for debugging/migrating between platforms
 */
export function getStorageKeyPrefix(): string {
  return Platform.OS === 'web' ? 'web_' : 'native_';
}
