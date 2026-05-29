import { useState } from 'react';
import { useApi } from '../context/ApiContext.jsx';

const LoginPage = ({ onLogin }) => {
  const { baseURL, request, setToken } = useApi();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Usar endpoint de login admin (mesmo sistema do app, mas verifica se é admin)
      const response = await request({
        method: 'POST',
        url: '/auth/admin/login',
        data: { email, senha },
      });

      if (response.token) {
        setToken(response.token);
        onLogin(response.user);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Erro ao fazer login. Verifique suas credenciais.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: 400,
        padding: '32px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <h1 style={{ 
          marginBottom: 8,
          textAlign: 'center',
          color: '#1e293b',
        }}>
          Dashboard Admin
        </h1>
        <p style={{ 
          marginBottom: 24,
          textAlign: 'center',
          color: '#64748b',
          fontSize: 14,
        }}>
          Faça login para acessar o painel
        </p>

        {error && (
          <div style={{
            padding: '12px',
            marginBottom: 16,
            background: '#fee2e2',
            color: '#b91c1c',
            borderRadius: 8,
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block',
              marginBottom: 6,
              fontSize: 14,
              fontWeight: 500,
              color: '#334155',
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block',
              marginBottom: 6,
              fontSize: 14,
              fontWeight: 500,
              color: '#334155',
            }}>
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="primary"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;

