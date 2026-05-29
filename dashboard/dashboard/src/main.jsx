import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ApiProvider } from './context/ApiContext.jsx';
import './styles.css';

// Suprimir warnings conhecidos do react-beautiful-dnd sobre defaultProps
// Este é um warning de depreciação da biblioteca, não afeta a funcionalidade
const originalWarn = console.warn;
const originalError = console.error;

console.warn = (...args) => {
  const message = args[0];
  if (
    typeof message === 'string' &&
    (
      (message.includes('defaultProps') && message.includes('memo components')) ||
      (message.includes('Connect(Droppable)') && message.includes('defaultProps')) ||
      (message.includes('react-beautiful-dnd') && message.includes('defaultProps'))
    )
  ) {
    // Suprimir apenas o warning específico do react-beautiful-dnd
    return;
  }
  originalWarn.apply(console, args);
};

console.error = (...args) => {
  const message = args[0];
  // Suprimir erro de favicon que não afeta a funcionalidade
  if (
    typeof message === 'string' &&
    message.includes('favicon.ico') &&
    message.includes('404')
  ) {
    return;
  }
  // Suprimir erros 404 de produtos (produtos podem não existir mais, é esperado)
  const allArgs = args.join(' ');
  if (
    (typeof message === 'string' && message.includes('404')) ||
    (allArgs.includes('/api/products/') && allArgs.includes('404')) ||
    (allArgs.includes('Request failed with status code 404') && allArgs.includes('/products/'))
  ) {
    return;
  }
  // Suprimir warning do react-beautiful-dnd sobre defaultProps (emitido via console.error pelo React)
  if (
    typeof message === 'string' &&
    (
      (message.includes('defaultProps') && message.includes('memo components')) ||
      (message.includes('Connect(Droppable)') && message.includes('defaultProps')) ||
      (message.includes('react-beautiful-dnd') && message.includes('defaultProps'))
    )
  ) {
    return;
  }
  // Verificar se algum dos argumentos contém o warning do react-beautiful-dnd
  if (
    allArgs.includes('defaultProps') &&
    (allArgs.includes('memo components') || allArgs.includes('Connect(Droppable)'))
  ) {
    return;
  }
  originalError.apply(console, args);
};

// Removendo StrictMode aqui porque o react-beautiful-dnd não se dá bem com o duplo render do React 18,
// o que quebrava o arrastar/soltar das seções no editor.
ReactDOM.createRoot(document.getElementById('root')).render(
  <ApiProvider>
    <App />
  </ApiProvider>
);


