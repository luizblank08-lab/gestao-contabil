import { notifications } from '@mantine/notifications';
import { traduzirErro } from './supabase';

export const avisoSucesso = (mensagem: string) =>
  notifications.show({ color: 'green', title: 'Pronto', message: mensagem });
export const avisoErro = (e: unknown) =>
  notifications.show({ color: 'red', title: 'Não foi possível concluir', message: traduzirErro(e), autoClose: 7000 });
