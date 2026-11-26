import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Alert, Button, Center, Stack } from '@mantine/core';
import { ProvedorSessao, useSessao } from './lib/sessao';
import { lerConexao } from './lib/supabase';
import { Carregando } from './components/Carregando';
import { Configurar } from './pages/auth/Configurar';
import { Login } from './pages/auth/Login';
import { CriarConta } from './pages/auth/CriarConta';
import { EsqueciSenha } from './pages/auth/EsqueciSenha';
import { TrocarSenha } from './pages/auth/TrocarSenha';
import { Layout } from './Layout';
import { Empresas } from './pages/gestor/Empresas';
import { Equipe } from './pages/gestor/Equipe';
import { Configuracoes } from './pages/gestor/Configuracoes';
import { Modelos } from './pages/gestor/Modelos';
import { MinhasEmpresas } from './pages/usuario/MinhasEmpresas';
import { Perfil } from './pages/usuario/Perfil';
import { Painel } from './pages/gestor/Painel';
import { ChecklistsMes } from './pages/gestor/ChecklistsMes';
import { MinhasTarefas } from './pages/usuario/MinhasTarefas';

function Rotas() {
  const { carregando, sessao, membro, ehGestor, sair } = useSessao();

  if (carregando) return <Carregando texto="Abrindo…" />;

  if (!sessao) {
    return (
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/criar-conta" element={<CriarConta />} />
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (!membro) return <CriarConta jaConectado />;

  if (!membro.ativo) {
    return (
      <Center h="100%">
        <Stack w={420}>
          <Alert color="red" title="Acesso desativado">Seu usuário foi desativado. Fale com o Gestor do escritório.</Alert>
          <Button variant="default" onClick={sair}>Sair</Button>
        </Stack>
      </Center>
    );
  }

  if (membro.trocar_senha) return <TrocarSenha />;

  return (
    <Routes>
      <Route element={<Layout />}>
        {ehGestor ? (
          <>
            <Route path="/" element={<Navigate to="/painel" replace />} />
            <Route path="/painel" element={<Painel />} />
            <Route path="/empresas" element={<Empresas />} />
            <Route path="/checklists" element={<ChecklistsMes />} />
            <Route path="/modelos" element={<Modelos />} />
            <Route path="/equipe" element={<Equipe />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/perfil" element={<Perfil />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Navigate to="/tarefas" replace />} />
            <Route path="/tarefas" element={<MinhasTarefas />} />
            <Route path="/minhas-empresas" element={<MinhasEmpresas />} />
            <Route path="/perfil" element={<Perfil />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  if (!lerConexao()) return <Configurar />;
  return (
    <HashRouter>
      <ProvedorSessao>
        <Rotas />
      </ProvedorSessao>
    </HashRouter>
  );
}
