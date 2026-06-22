/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        cream: {
          DEFAULT: '#FFF8F5',
          light: '#FFFDFB',
          dark: '#FFF0EB',
        },
        coral: {
          DEFAULT: '#FF7B7B',
          light: '#FFA5A5',
          dark: '#E86969',
        },
        warm: {
          orange: '#FFB347',
          light: '#FFE4C4',
        },
        ink: '#3D2C2A',
        muted: '#8B7D7A',
        rule: '#E8D5D0',
        skyblue: '#7BCEFF',
        mint: {
          DEFAULT: '#6FD3B5',
          dark: '#4FB597',
        },
        sky: {
          DEFAULT: '#7BCEFF',
          dark: '#5BA8E0',
        },
      },
      fontFamily: {
        outfit: ['Outfit', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
        btn: '14px',
      },
      boxShadow: {
        soft: '0 2px 16px rgba(61, 44, 42, 0.06)',
        card: '0 4px 24px rgba(61, 44, 42, 0.08)',
        float: '0 6px 20px rgba(255, 123, 123, 0.35)',
      },
      animation: {
        'float-in': 'floatIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'fade-up': 'fadeUp 0.5s ease-out',
        'pop': 'pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'slide-up': 'slideUp 0.35s ease-out',
        'bounce-gentle': 'bounceGentle 2s infinite',
      },
      keyframes: {
        floatIn: {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        fadeUp: {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pop: {
          '0%': { transform: 'scale(0.95)' },
          '50%': { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        bounceGentle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
};
