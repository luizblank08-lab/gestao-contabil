import { createTheme } from '@mantine/core';

export const tema = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  fontFamily: "'Segoe UI', system-ui, -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif",
  headings: { fontFamily: "'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif", fontWeight: '600' },
  fontSizes: { xs: '13px', sm: '14px', md: '15px', lg: '17px', xl: '20px' },
  components: {
    Button: { defaultProps: { radius: 'md' } },
    TextInput: { defaultProps: { size: 'sm' } },
    Badge: { styles: { root: { textTransform: 'none', flexShrink: 0, overflow: 'visible' }, label: { overflow: 'visible', textOverflow: 'clip' } } },
    Modal: { defaultProps: { centered: true, overlayProps: { backgroundOpacity: 0.4, blur: 2 } } },
  },
});
