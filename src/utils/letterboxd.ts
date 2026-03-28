import { Linking } from 'react-native';

/**
 * Generate Letterboxd film URL from movie title
 */
export const getLetterboxdUrl = (title: string, year?: number): string => {
  // Generate slug from title
  let slug = title
    .toLowerCase()
    .replace(/['']/g, '')           // remove apostrophes
    .replace(/[^a-z0-9\s-]/g, '')   // remove special chars
    .replace(/\s+/g, '-')           // spaces to hyphens
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .replace(/^-|-$/g, '');         // trim leading/trailing hyphens

  return `https://letterboxd.com/film/${slug}/`;
};

/**
 * Get Letterboxd search URL as fallback
 */
export const getLetterboxdSearchUrl = (title: string): string => {
  return `https://letterboxd.com/search/${encodeURIComponent(title)}/`;
};

/**
 * Open Letterboxd film page
 */
export const openLetterboxd = async (title: string, year?: number): Promise<void> => {
  const url = getLetterboxdUrl(title, year);
  try {
    await Linking.openURL(url);
  } catch (error) {
    // Fallback to search if direct URL fails
    console.warn('[Letterboxd] Direct URL failed, trying search:', error);
    try {
      await Linking.openURL(getLetterboxdSearchUrl(title));
    } catch (searchError) {
      console.error('[Letterboxd] Failed to open:', searchError);
    }
  }
};

/**
 * Open Letterboxd homepage
 */
export const openLetterboxdHome = async (): Promise<void> => {
  try {
    await Linking.openURL('https://letterboxd.com/');
  } catch (error) {
    console.error('[Letterboxd] Failed to open homepage:', error);
  }
};
