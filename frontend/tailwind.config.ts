import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Paleta do logo (Galo de Barcelos): vermelho, dourado, creme,
      // carvão do galo e o verde do "&".
      colors: {
        brand: {
          red: '#D9251D',
          'red-dark': '#B01B14',
          gold: '#F2B705',
          'gold-dark': '#D99E00',
          cream: '#FBF3DA',
          'cream-dark': '#F3E6BE',
          ink: '#292423',
          green: '#1F7A3F',
        },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
