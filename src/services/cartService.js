// Serviço compartilhado para gerenciar carrinhos
// Em produção, usar Redis ou banco de dados

const carts = new Map();

class CartService {
  getCart(userId) {
    const cart = carts.get(userId);
    if (!cart) {
      return { items: [], total: 0 };
    }
    // Garantir que sempre tenha items e total
    return {
      items: cart.items || [],
      total: cart.total || 0
    };
  }

  setCart(userId, cart) {
    carts.set(userId, cart);
  }

  deleteCart(userId) {
    carts.delete(userId);
  }

  clearCart(userId) {
    carts.set(userId, { items: [], total: 0 });
  }
}

module.exports = new CartService();

