import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';

/** The faces the theme's typography roles name; loaded once by CoreApp before first render. */
export const fontMap = {
  'InstrumentSans-Regular': InstrumentSans_400Regular,
  'InstrumentSans-Medium': InstrumentSans_500Medium,
  'InstrumentSans-SemiBold': InstrumentSans_600SemiBold,
  'InstrumentSans-Bold': InstrumentSans_700Bold,
  // Display face — big balances / hero numbers only (`displayHero`/`display` typography roles).
  'BricolageGrotesque-SemiBold': BricolageGrotesque_600SemiBold,
  // Mono/eyebrow face — section labels and status badges.
  'IBMPlexMono-Regular': IBMPlexMono_400Regular,
  'IBMPlexMono-Medium': IBMPlexMono_500Medium,
};
