import { Link } from 'react-router-dom';
import { BLOG_NAME } from '../lib/utils';

// Preenchidos na Vercel (Environment Variables). Se faltarem, o aviso fica visível de propósito.
const CONTROLLER = import.meta.env.VITE_CONTROLLER_NAME || BLOG_NAME;
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;
const UPDATED = '20 de outubro de 2026';

export default function Privacy() {
  return (
    <>
      <h1 className="page-title">Política de Privacidade</h1>
      <div className="prose">
        <p className="muted">Última atualização: {UPDATED}.</p>

        <h2>1. Quem somos</h2>
        <p>
          {BLOG_NAME} é um blog pessoal mantido por {CONTROLLER}, responsável pelo tratamento dos seus dados pessoais (controlador, conforme a Lei Geral de Proteção de Dados, LGPD).{' '}
          {CONTACT ? <>Contato: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : <strong>Contato: e-mail ainda não informado.</strong>}
        </p>

        <h2>2. Quais dados coletamos</h2>
        <ul>
          <li><strong>Ao entrar com o Google:</strong> seu nome, seu e-mail e um identificador interno da conta. A conta Google pode enviar também foto de perfil e outros dados básicos; o site não os exibe nem os utiliza. Não recebemos a sua senha.</li>
          <li><strong>Ao usar o site:</strong> as publicações que você curtiu e a contagem de visualizações. Para contar uma visualização por pessoa por dia, usamos o identificador da sua conta (se estiver logado) ou um identificador aleatório guardado no seu navegador (se não estiver).</li>
          <li><strong>Dados técnicos</strong> (como o endereço IP) são tratados pelos serviços de hospedagem e de banco de dados para o funcionamento e a segurança do site.</li>
        </ul>

        <h2>3. Para que usamos</h2>
        <p>Para permitir o seu login, permitir que você curta publicações, escolher quais textos aparecem em destaque (com base em visualizações e curtidas) e manter o site seguro. Não vendemos seus dados, não os usamos para publicidade e não criamos perfis comerciais.</p>

        <h2>4. Base legal</h2>
        <p>O seu consentimento, dado ao entrar com a sua conta (LGPD, art. 7º, I), e o legítimo interesse em saber o que é lido no blog, para a contagem de visualizações (art. 7º, IX).</p>

        <h2>5. Com quem compartilhamos</h2>
        <p>Usamos prestadores de serviço que tratam dados em nosso nome: <strong>Google</strong> (login e fontes de texto; ao abrir o site, seu navegador pode se conectar aos servidores do Google para carregá-las, o que revela seu endereço IP), <strong>Supabase</strong> (banco de dados, autenticação e armazenamento de imagens) e <strong>Vercel</strong> (hospedagem). Esses serviços podem processar dados em servidores fora do Brasil (transferência internacional, LGPD, art. 33).</p>

        <h2>6. Armazenamento no seu navegador</h2>
        <p>Guardamos no seu navegador a sessão de login e, para quem não está logado, um identificador aleatório de visitante. Não usamos cookies de publicidade ou de rastreamento.</p>

        <h2>7. Por quanto tempo guardamos</h2>
        <p>Enquanto a sua conta existir. Você pode excluir a conta quando quiser, em Minha conta → Excluir minha conta. Ao excluir, apagamos seu nome, e-mail, curtidas e os registros de visualização ligados à sua conta.</p>

        <h2>8. Seus direitos</h2>
        <p>Pela LGPD (art. 18), você pode pedir: confirmação de que tratamos seus dados, acesso a eles, correção, anonimização ou eliminação, portabilidade, informação sobre com quem os compartilhamos e a revogação do consentimento. Para exercer qualquer um desses direitos, escreva para {CONTACT ? <a href={`mailto:${CONTACT}`}>{CONTACT}</a> : 'o e-mail de contato'}.</p>

        <h2>9. Segurança</h2>
        <p>O acesso ao site usa conexão criptografada (HTTPS), e as permissões de leitura e escrita são controladas por regras no banco de dados: somente a autora acessa o painel de publicação.</p>

        <h2>10. Mudanças nesta política</h2>
        <p>Se algo mudar, atualizaremos esta página e a data acima.</p>

        <p><Link to="/">← Voltar ao início</Link></p>
      </div>
    </>
  );
}
