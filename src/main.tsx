import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { DatesProvider } from '@mantine/dates';
import 'dayjs/locale/pt-br';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import './estilos.css';
import { tema } from './tema';
import App from './App';

// Arquivo solto fora da área de anexos não deve abrir dentro do app
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={tema} defaultColorScheme="light">
      <DatesProvider settings={{ locale: 'pt-br', firstDayOfWeek: 0 }}>
      <ModalsProvider labels={{ confirm: 'Confirmar', cancel: 'Cancelar' }}>
        <Notifications position="bottom-center" limit={3} autoClose={3500} />
        <App />
      </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  </React.StrictMode>
);
