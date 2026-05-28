/**
 * Serviço para calcular feriados nacionais e municipais do Brasil
 * Calcula automaticamente feriados fixos e móveis
 */

// Feriados fixos nacionais e municipais do Rio de Janeiro
const FERIADOS_FIXOS = [
  { month: 0, day: 1, name: 'Confraternização Universal', cities: ['all'] },
  { month: 0, day: 20, name: 'São Sebastião', cities: ['Rio de Janeiro', 'Nilópolis', 'Mesquita'] }, // Feriado municipal do Rio de Janeiro (20 de janeiro)
  { month: 3, day: 21, name: 'Tiradentes', cities: ['all'] },
  { month: 3, day: 23, name: 'São Jorge', cities: ['Rio de Janeiro', 'Nilópolis', 'Mesquita'] }, // Feriado municipal do Rio de Janeiro
  { month: 4, day: 1, name: 'Dia do Trabalho', cities: ['all'] },
  { month: 8, day: 7, name: 'Independência do Brasil', cities: ['all'] },
  { month: 9, day: 12, name: 'Nossa Senhora Aparecida', cities: ['all'] },
  { month: 10, day: 2, name: 'Finados', cities: ['all'] },
  { month: 10, day: 15, name: 'Proclamação da República', cities: ['all'] },
  { month: 10, day: 20, name: 'Dia da Consciência Negra', cities: ['Rio de Janeiro', 'Nilópolis', 'Mesquita'] }, // Feriado municipal do Rio de Janeiro
  { month: 11, day: 25, name: 'Natal', cities: ['all'] },
];

/**
 * Calcula a data da Páscoa usando o algoritmo de Meeus/Jones/Butcher
 * @param {number} ano - Ano para calcular a Páscoa
 * @returns {Date} Data da Páscoa
 */
function calcularPascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mesPascoa = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const diaPascoa = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mesPascoa, diaPascoa);
}

/**
 * Calcula feriados móveis baseados na Páscoa
 * @param {number} ano - Ano para calcular os feriados móveis
 * @returns {Array} Array de feriados móveis
 */
function getFeriadosMoveis(ano) {
  const feriados = [];
  const pascoa = calcularPascoa(ano);
  
  // Sexta-feira Santa
  const sextaSanta = new Date(pascoa);
  sextaSanta.setDate(pascoa.getDate() - 2);
  feriados.push({ date: sextaSanta, name: 'Sexta-feira Santa', cities: ['all'] });
  
  // Corpus Christi
  const corpusChristi = new Date(pascoa);
  corpusChristi.setDate(pascoa.getDate() + 60);
  feriados.push({ date: corpusChristi, name: 'Corpus Christi', cities: ['all'] });
  
  return feriados;
}

/**
 * Verifica se um feriado se aplica a uma cidade específica
 * @param {Object} feriado - Objeto do feriado com propriedade cities
 * @param {string} cidade - Nome da cidade
 * @returns {boolean} True se o feriado se aplica à cidade
 */
function feriadoAplicaACidade(feriado, cidade) {
  if (!feriado.cities || feriado.cities.length === 0) {
    return false;
  }
  
  // Se contém 'all', aplica a todas as cidades
  if (feriado.cities.includes('all')) {
    return true;
  }
  
  // Verificar se a cidade está na lista
  return feriado.cities.some(c => 
    c.toLowerCase().trim() === cidade.toLowerCase().trim()
  );
}

/**
 * Formata uma data como ISO string garantindo meia-noite UTC (evita problemas de timezone)
 * @param {number} ano - Ano
 * @param {number} mes - Mês (0-11)
 * @param {number} dia - Dia (1-31)
 * @returns {string} Data em formato ISO (YYYY-MM-DDTHH:mm:ss.sssZ) com meia-noite UTC
 */
function formatDateAsISO(ano, mes, dia) {
  // Criar data em UTC diretamente (evita problemas de timezone local)
  const dateStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}T00:00:00.000Z`;
  return dateStr;
}

/**
 * Obtém feriados próximos (próximos N dias)
 * @param {number} dias - Número de dias para buscar (padrão: 60)
 * @returns {Array} Array de feriados próximos
 */
function getFeriadosProximos(dias = 60) {
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0); // Usar UTC para comparações
  const hojeUTC = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  
  const limite = new Date(hojeUTC);
  limite.setUTCDate(limite.getUTCDate() + dias);
  
  const anoAtual = hojeUTC.getUTCFullYear();
  const anoProximo = anoAtual + 1;
  
  const todosFeriados = [];
  
  // Adicionar feriados fixos
  [anoAtual, anoProximo].forEach(ano => {
    FERIADOS_FIXOS.forEach(feriado => {
      // Criar data ISO diretamente em UTC (evita problemas de timezone)
      const dateISO = formatDateAsISO(ano, feriado.month, feriado.day);
      const data = new Date(dateISO);
      
      if (data >= hojeUTC && data <= limite) {
        todosFeriados.push({
          date: dateISO, // Já está em formato ISO UTC
          name: feriado.name,
          cities: feriado.cities
        });
      }
    });
    
    // Adicionar feriados móveis
    getFeriadosMoveis(ano).forEach(feriado => {
      // Converter para UTC para evitar problemas de timezone
      const dataLocal = new Date(feriado.date);
      const dateISO = formatDateAsISO(
        dataLocal.getFullYear(),
        dataLocal.getMonth(),
        dataLocal.getDate()
      );
      const data = new Date(dateISO);
      
      if (data >= hojeUTC && data <= limite) {
        todosFeriados.push({
          date: dateISO,
          name: feriado.name,
          cities: feriado.cities
        });
      }
    });
  });
  
  // Remover duplicatas e ordenar
  const feriadosUnicos = [];
  const datasVistas = new Set();
  
  todosFeriados.forEach(f => {
    const dataStr = f.date;
    if (!datasVistas.has(dataStr)) {
      datasVistas.add(dataStr);
      feriadosUnicos.push(f);
    }
  });
  
  return feriadosUnicos.sort((a, b) => new Date(a.date) - new Date(b.date));
}

module.exports = {
  getFeriadosProximos,
  feriadoAplicaACidade,
  FERIADOS_FIXOS
};
