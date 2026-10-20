import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Theme from './pages/Theme';
import Post from './pages/Post';
import About from './pages/About';
import Admin from './pages/Admin';
import Privacy from './pages/Privacy';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/tema/:slug" element={<Theme />} />
        <Route path="/post/:slug" element={<Post />} />
        <Route path="/sobre" element={<About />} />
        <Route path="/privacidade" element={<Privacy />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<p className="empty">Página não encontrada.</p>} />
      </Route>
    </Routes>
  );
}
