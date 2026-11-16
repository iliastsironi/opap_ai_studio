import React from 'react';

/**
 * Η μάρκα: η εφαρμογή λέγεται «var», η εταιρία BeSimpl.
 *
 * Οι δύο έχουν ξεχωριστή θέση: το var είναι αυτό που βλέπει ο χρήστης να
 * δουλεύει (πλευρικό μενού, είσοδος, καρτέλα του browser), η BeSimpl είναι αυτός
 * που το φτιάχνει και υπογράφει από κάτω.
 *
 * Τα λογότυπα ζουν εδώ ως inline SVG και όχι ως <img>. Τα αρχεία τους γράφουν
 * το όνομα με γραμματοσειρά Nunito που φορτώνεται από το internet, και ένα SVG
 * που φορτώνεται ως εικόνα δεν επιτρέπεται να φορτώσει εξωτερική γραμματοσειρά·
 * το όνομα θα έβγαινε με άλλη, αταίριαστη. Μέσα στη σελίδα το SVG παίρνει τη
 * γραμματοσειρά της σελίδας (index.html), και το όνομα βγαίνει όπως σχεδιάστηκε.
 * Τα αυτούσια αρχεία είναι στο /brand/ για όποιον τα χρειάζεται.
 */

export const BRAND = {
  /** Το βαθύ μπλε του λογότυπου. */
  ink: '#17212F',
  /** Το τιρκουάζ: το σύμβολο και η τελεία στο τέλος του ονόματος. */
  turquoise: '#35C9BE',
  /** Nunito 800, με εφεδρικές για όσο δεν έχει φορτώσει. */
  font: "'Nunito', 'Arial Rounded MT Bold', 'Helvetica Neue', Arial, sans-serif",
} as const;

/** Το σχήμα του συμβόλου BeSimpl, στο σύστημα συντεταγμένων 224×250 του αρχείου του. */
const SYMBOL_PATH =
  'M24 24V170A56 56 0 0 0 80 226H144A56 56 0 0 0 200 170V166A56 56 0 0 0 144 110H96';

/** Το σύμβολο μόνο του, σε όποιο χρώμα ζητηθεί. */
export const BesimplSymbol: React.FC<{ color?: string; className?: string; title?: string }> = ({
  color = BRAND.turquoise,
  className,
  title,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 224 250"
    className={className}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    <path d={SYMBOL_PATH} fill="none" stroke={color} strokeWidth={48} strokeLinecap="round" />
  </svg>
);

/** Το εικονίδιο της BeSimpl: στρογγυλεμένο τετράγωνο, τιρκουάζ σύμβολο πάνω σε βαθύ μπλε. */
export const BesimplIcon: React.FC<{ size?: number; className?: string; title?: string }> = ({
  size = 32,
  className,
  title = 'BeSimpl',
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 1024 1024"
    width={size}
    height={size}
    className={className}
    role="img"
    aria-label={title}
  >
    <rect width={1024} height={1024} rx={232} fill={BRAND.ink} />
    <g transform="translate(272 232) scale(2.143)">
      <path d={SYMBOL_PATH} fill="none" stroke={BRAND.turquoise} strokeWidth={48} strokeLinecap="round" />
    </g>
  </svg>
);

/**
 * Το όνομα της εφαρμογής: «var» και η τιρκουάζ τελεία. Κείμενο, όχι εικόνα, ώστε
 * να διαβάζεται από ανάγνωση οθόνης και να παίρνει το χρώμα του περιβάλλοντος.
 */
export const VarWordmark: React.FC<{ className?: string; dotColor?: string }> = ({
  className,
  dotColor = BRAND.turquoise,
}) => (
  <span className={className} style={{ fontFamily: BRAND.font, fontWeight: 800, letterSpacing: '-0.02em' }}>
    var<span style={{ color: dotColor }}>.</span>
  </span>
);

/** Το πλήρες λογότυπο της εταιρίας: σύμβολο και «besimpl.». `tone` = το φόντο στο οποίο μπαίνει. */
export const BesimplLogo: React.FC<{ tone?: 'light' | 'dark'; height?: number; className?: string }> = ({
  tone = 'light',
  height = 24,
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 600 160"
    height={height}
    className={className}
    role="img"
    aria-label="besimpl."
  >
    <g transform="translate(20 18) scale(0.448)">
      <path d={SYMBOL_PATH} fill="none" stroke={BRAND.turquoise} strokeWidth={48} strokeLinecap="round" />
    </g>
    <text
      x={142}
      y={130}
      fontSize={112}
      fill={tone === 'dark' ? '#FFFFFF' : BRAND.ink}
      style={{ fontFamily: BRAND.font, fontWeight: 800, letterSpacing: '-2px' }}
    >
      besimpl<tspan fill={BRAND.turquoise}>.</tspan>
    </text>
  </svg>
);
