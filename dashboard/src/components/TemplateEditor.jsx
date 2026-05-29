import { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import HomePreview from './HomePreview.jsx';

// Componente para busca de produtos na Oferta do Dia
const ProductSearchInput = ({ value, onChange, baseURL }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedProductName, setSelectedProductName] = useState('');

  useEffect(() => {
    if (value) {
      // Se já tem um ID, buscar o nome do produto
      const fetchProductName = async () => {
        try {
          const apiBase = (baseURL || '').replace(/\/api\/?$/, '').replace(/\/$/, '');
          const response = await fetch(`${apiBase}/api/products/${value}`);
          if (response.ok) {
            const data = await response.json();
            if (data.product) {
              setSelectedProductName(data.product.nome);
            }
          }
        } catch (error) {
          console.error('Erro ao buscar nome do produto:', error);
        }
      };
      fetchProductName();
    }
  }, [value, baseURL]);

  const searchProducts = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setIsLoading(true);
      const apiBase = (baseURL || '').replace(/\/api\/?$/, '').replace(/\/$/, '');
      const response = await fetch(`${apiBase}/api/products?busca=${encodeURIComponent(query)}&limit=10`);
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.products || []);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Erro ao buscar produtos:', error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    searchProducts(query);
    setShowResults(true);
  };

  const selectProduct = (product) => {
    console.log('🎯 [ProductSearch] Produto selecionado:', product.nome, 'ID interno:', product.id, 'ID Shopify:', product.codigo);
    onChange(product.id); // Usar ID interno do banco de dados
    setSelectedProductName(product.nome);
    setSearchQuery('');
    setShowResults(false);
    setSearchResults([]);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={searchQuery || selectedProductName}
        onChange={handleSearchChange}
        onFocus={() => {
          setShowResults(true);
          if (searchQuery.length >= 2) {
            searchProducts(searchQuery);
          }
        }}
        onBlur={() => {
          // Delay para permitir clique nos resultados
          setTimeout(() => setShowResults(false), 200);
        }}
        placeholder="Buscar produto pelo nome..."
        style={{ width: '100%', padding: '8px' }}
      />
      {showResults && (searchResults.length > 0 || isLoading) && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: '#fff',
          border: '1px solid #ddd',
          borderRadius: '4px',
          maxHeight: '300px',
          overflowY: 'auto',
          zIndex: 1000,
          marginTop: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}>
          {isLoading ? (
            <div style={{ padding: '15px', textAlign: 'center', color: '#666' }}>
              Buscando...
            </div>
          ) : (
            searchResults.map((product) => (
              <div
                key={product.id}
                onClick={() => selectProduct(product)}
                style={{
                  padding: '12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #eee',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                    {product.nome}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    ID: <strong>{product.id}</strong> | Shopify: {product.codigo}
                  </div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#25053c', marginLeft: '12px' }}>
                  R$ {parseFloat(product.preco_varejo || 0).toFixed(2).replace('.', ',')}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const defaultSection = () => ({
  id: `sec-${Date.now()}`,
  title: 'Nova seção',
  section_key: `section_${Date.now()}`,
  section_type: 'collection',
  config: {},
});

const TemplateEditor = ({ template, draftVersion, onSaveLayout, onPublish, onUploadBanner, saving, baseURL }) => {
  const [sections, setSections] = useState([]);
  const [banners, setBanners] = useState([]);
  const [metadata, setMetadata] = useState({});
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionType, setNewSectionType] = useState('collection');
  const [uploading, setUploading] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const selectedSection = sections.find((s) => s.id === selectedSectionId) || null;

  // Layout inicial para quem ainda não tem nada salvo (espelha a estrutura básica da Home atual)
  const initialLayout = useMemo(
    () => ({
      metadata: {
        heroLayout: 'banner principal fixo',
        theme: 'default',
      },
      sections: [
        {
          id: 'initial-hero',
          section_key: 'hero_banners',
          section_type: 'hero',
          title: 'Banner principal (slide automático)',
          config: {
            // Usa o array de Banners abaixo; aqui é só para aparecer como seção
            source: 'banners',
          },
        },
        {
          id: 'initial-featured',
          section_key: 'featured_collection',
          section_type: 'featured',
          // Espelho da configuração atual do app (FEATURED_COLLECTION_CONFIG)
          title: 'Black Aniversário',
          config: {
            collectionId: 501821276465,
            limit: 20,
          },
        },
        {
          id: 'initial-secondary',
          section_key: 'secondary_collection',
          section_type: 'collection',
          // Espelho da configuração atual do app (SECONDARY_COLLECTION_CONFIG)
          title: 'Ofertas',
          config: {
            collectionId: 522590126385,
            limit: 6,
          },
        },
        {
          id: 'initial-special-cards',
          section_key: 'special_cards',
          section_type: 'special_cards',
          title: 'Cards especiais (carrinho, favorito, etc.)',
          config: {
            cards: ['cart', 'recently_viewed', 'favorite', 'store', 'whatsapp'],
          },
        },
        {
          id: 'initial-promo-banner',
          section_key: 'promo_banner',
          section_type: 'promo_banner',
          title: 'Faixa Promocional',
          config: {
            enabled: false,
            backgroundColor: '#ffffff',
            textColor: '#333',
            url: '',
            richContent: [],
          },
        },
      ],
      // Quatro slots para espelhar os 4 banners atuais do app.
      // Se você não subir imagem aqui, o app continua usando a URL padrão definida no app.
      banners: [
        {
          id: 'initial-banner-1',
          title: 'Banner 1',
          variant: 'hero',
          imageUrl: 'https://i.ibb.co/95K0NqF/Banner1.webp',
        },
        {
          id: 'initial-banner-2',
          title: 'Banner 2',
          variant: 'hero',
          imageUrl: 'https://i.ibb.co/PGq6JyJX/Banner2.webp',
        },
        {
          id: 'initial-banner-3',
          title: 'Banner 3',
          variant: 'hero',
          imageUrl: 'https://i.ibb.co/m5bzRD6P/Banner3.webp',
        },
        {
          id: 'initial-banner-4',
          title: 'Banner 4',
          variant: 'hero',
          imageUrl: 'https://i.ibb.co/jvL7m3rr/Banner4.webp',
        },
      ],
    }),
    []
  );

  useEffect(() => {
    let payload = draftVersion?.payload;

    const hasLayout =
      payload &&
      ((Array.isArray(payload.sections) && payload.sections.length > 0) ||
        (Array.isArray(payload.banners) && payload.banners.length > 0));

    if (!hasLayout) {
      payload = initialLayout;
    }

    // Garantir que o template "home v1" seja sempre espelho do app,
    // mesmo se já existirem valores antigos salvos no rascunho.
    const isHomeV1 = template?.name === 'home v1';

    const patchedSections = (payload.sections || []).map((section) => {
      // Só forçar valores padrão nas seções "fixas" do home v1,
      // identificadas pela section_key. Coleções novas criadas pelo usuário
      // (section_key dinâmico) não são alteradas.
      if (section.section_key === 'featured_collection') {
        const config = section.config || {};
        return {
          ...section,
          // Não forçar valores se já existem - apenas usar padrões se faltarem
          title: section.title || 'Black Aniversário',
          config: {
            ...config,
            collectionId: config.collectionId ?? 501821276465,
            limit: config.limit ?? 20,
          },
          section_type: 'featured',
          section_key: section.section_key || 'featured_collection',
        };
      }

      if (section.section_key === 'secondary_collection') {
        const config = section.config || {};
        return {
          ...section,
          // Não forçar valores se já existem - apenas usar padrões se faltarem
          title: section.title || 'Ofertas',
          config: {
            ...config,
            collectionId: config.collectionId ?? 522590126385,
            limit: config.limit ?? 6,
          },
          section_type: 'collection',
          section_key: section.section_key || 'secondary_collection',
        };
      }

      // Normalização para seções de banner-grid: garantir array de imagens
      if (section.section_type === 'banner-grid') {
        const config = section.config || {};
        let images = Array.isArray(config.images) ? config.images : [];
        if (!images.length && config.imageUrl) {
          images = [{ id: `img-${Date.now()}`, url: config.imageUrl }];
        }
        return {
          ...section,
          config: {
            ...config,
            images,
          },
        };
      }

      return section;
    });

    payload = {
      ...payload,
      sections: patchedSections,
    };

    setSections(payload.sections || []);
    setBanners(payload.banners || []);
    setMetadata(payload.metadata || {});
  }, [draftVersion, initialLayout, template]);

  const handleAddSection = () => {
    const section = defaultSection();
    section.title = newSectionTitle || section.title;
    section.section_type = newSectionType;
    setSections((prev) => [...prev, section]);
    setNewSectionTitle('');
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(sections);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setSections(reordered);
  };

  const handleBannerUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const uploaded = await onUploadBanner(file);
      setBanners((prev) => [
        ...prev,
        {
          id: `ban-${Date.now()}`,
          title: file.name,
          imageUrl: uploaded.url,
          variant: 'hero',
        },
      ]);
    } finally {
      setUploading(false);
    }
  };

  const handleSectionBannerUpload = async (sectionId, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const uploaded = await onUploadBanner(file);
      setSections((prev) => {
        const next = prev.map((s) => {
          if (s.id !== sectionId) return s;
          const existingImages = Array.isArray(s.config?.images) ? s.config.images : [];
          const newImage = {
            id: `img-${Date.now()}`,
            url: uploaded.url,
          };
          return {
            ...s,
            config: {
              ...(s.config || {}),
              imageUrl: uploaded.url, // compatibilidade com o app
              images: [...existingImages, newImage],
            },
          };
        });
        // Salvar imediatamente o layout atualizado para garantir
        // que a imagem fique persistida mesmo após recarregar o dashboard.
        onSaveLayout({
          sections: next,
          banners,
          metadata,
        });
        return next;
      });
    } finally {
      setUploading(false);
    }
  };

  const moveBanner = (from, to) => {
    if (to < 0 || to >= banners.length) return;
    const reordered = Array.from(banners);
    const [removed] = reordered.splice(from, 1);
    reordered.splice(to, 0, removed);
    setBanners(reordered);
  };

  const currentPayload = useMemo(
    () => ({
      sections,
      banners,
      metadata,
    }),
    [sections, banners, metadata]
  );

  const handleSave = () => {
    console.log('💾 [Dashboard] Salvando layout:', JSON.stringify(currentPayload, null, 2));
    // Verificar se a seção oferta_do_dia tem productId
    const ofertaSection = currentPayload.sections?.find(s => s.section_type === 'oferta_do_dia');
    if (ofertaSection) {
      console.log('⚡ [Dashboard] Seção Oferta do Dia encontrada:', JSON.stringify(ofertaSection, null, 2));
      console.log('⚡ [Dashboard] ProductId:', ofertaSection.config?.productId);
    } else {
      console.log('⚠️ [Dashboard] Seção Oferta do Dia NÃO encontrada nas sections');
    }
    onSaveLayout(currentPayload);
  };

  const draftInfo = useMemo(() => {
    if (!draftVersion) return 'Nenhum rascunho';
    return `Rascunho v${draftVersion.version}`;
  }, [draftVersion]);

  if (!template) {
    return (
      <div className="card">
        <h2>Editor</h2>
        <p>Selecione um template para editar.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>
        Editor • {template.name}
        <span className="status-chip" style={{ marginLeft: 12 }}>
          {draftInfo}
        </span>
      </h2>

      <div className="input-row">
        <input
          value={newSectionTitle}
          onChange={(e) => setNewSectionTitle(e.target.value)}
          placeholder="Título da seção"
        />
        <select value={newSectionType} onChange={(e) => setNewSectionType(e.target.value)}>
          <option value="collection">Coleção</option>
          <option value="collection_carousel">Carrossel de Coleção</option>
          <option value="banner-grid">Grade de banners</option>
          <option value="promo_banner">Faixa Promocional</option>
          <option value="oferta_do_dia">Oferta do Dia</option>
          <option value="custom">Custom</option>
        </select>
        <button className="secondary" onClick={handleAddSection}>
          + Adicionar
        </button>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="sections">
          {(provided) => (
            <div className="section-list" ref={provided.innerRef} {...provided.droppableProps}>
              {sections.map((section, index) => (
                <Draggable key={section.id} draggableId={section.id} index={index}>
                  {(draggableProvided) => (
                    <div
                      className={`section-item ${selectedSectionId === section.id ? 'is-selected' : ''}`}
                      ref={draggableProvided.innerRef}
                      {...draggableProvided.draggableProps}
                      onClick={() => setSelectedSectionId(section.id)}
                    >
                      <span className="drag-handle" {...draggableProvided.dragHandleProps}>
                        ::
                      </span>
                      <div style={{ flex: 1 }}>
                        <strong>{section.title}</strong>
                        <small style={{ display: 'block', opacity: 0.7 }}>{section.section_type}</small>
                      </div>
                      <button
                        className="secondary"
                        onClick={() => setSections((prev) => prev.filter((s) => s.id !== section.id))}
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              {sections.length === 0 && <p style={{ margin: 0, opacity: 0.6 }}>Nenhuma seção ainda.</p>}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Editor de propriedades da seção selecionada */}
      {selectedSectionId && (
        <div style={{ marginTop: 20 }}>
          <h3>Configurações da seção</h3>
          {(() => {
            const section = sections.find((s) => s.id === selectedSectionId);
            if (!section) return null;

            const updateSection = (updater) => {
              setSections((prev) =>
                prev.map((s) => (s.id === section.id ? { ...s, ...updater(s) } : s))
              );
            };

            if (section.section_type === 'featured' || section.section_type === 'collection') {
              return (
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="input-row">
                    <input
                      value={section.title || ''}
                      onChange={(e) =>
                        updateSection(() => ({
                          title: e.target.value,
                        }))
                      }
                      placeholder="Nome da seção (exibido no app)"
                    />
                  </div>
                  <div className="input-row">
                    <input
                      value={section.config?.collectionId || ''}
                      onChange={(e) =>
                        updateSection((s) => ({
                          config: {
                            ...(s.config || {}),
                            collectionId: e.target.value,
                          },
                        }))
                      }
                      placeholder="ID da coleção (obrigatório para mostrar produtos)"
                    />
                    <input
                      type="number"
                      min={1}
                      value={section.config?.limit || ''}
                      onChange={(e) => {
                        const value = e.target.value ? Number(e.target.value) : undefined;
                        updateSection((s) => ({
                          config: {
                            ...(s.config || {}),
                            limit: value,
                          },
                        }));
                      }}
                      placeholder="Qtde de produtos (limite)"
                    />
                  </div>
                  <small style={{ opacity: 0.7 }}>
                    O título será usado como cabeçalho da coleção no app e também para identificar a
                    seção no layout.
                  </small>
                </div>
              );
            }

            if (section.section_type === 'collection_carousel') {
              return (
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="input-row">
                    <input
                      value={section.title || ''}
                      onChange={(e) =>
                        updateSection(() => ({
                          title: e.target.value,
                        }))
                      }
                      placeholder="Título do carrossel (exibido no app)"
                    />
                  </div>
                  <div className="input-row">
                    <input
                      value={section.config?.collectionId || ''}
                      onChange={(e) =>
                        updateSection((s) => ({
                          config: {
                            ...(s.config || {}),
                            collectionId: e.target.value,
                          },
                        }))
                      }
                      placeholder="ID da coleção (obrigatório)"
                    />
                  </div>
                  <small style={{ opacity: 0.7 }}>
                    O carrossel exibirá os produtos da coleção em formato horizontal, similar aos produtos relacionados.
                  </small>
                </div>
              );
            }

            if (section.section_type === 'promo_banner') {
              const config = section.config || {};
              const richContent = config.richContent || [];
              const iconOptions = [
                { value: 'gift', label: 'Presente' },
                { value: 'flash', label: 'Raio' },
                { value: 'truck', label: 'Caminhão' },
                { value: 'pricetag', label: 'Etiqueta' },
                { value: 'star', label: 'Estrela' },
                { value: 'heart', label: 'Coração' },
                { value: 'megaphone', label: 'Megafone' },
                { value: 'fire', label: 'Fogo' },
                { value: 'trending-up', label: 'Tendência' },
                { value: 'time', label: 'Relógio' },
                { value: 'location', label: 'Localização' },
                { value: 'card', label: 'Cartão' },
                { value: 'shield-checkmark', label: 'Escudo' },
                { value: 'checkmark-circle', label: 'Check' },
              ];

              const addRichItem = (type) => {
                const newItem = type === 'icon' 
                  ? { type: 'icon', icon: 'star-outline', color: config.textColor || '#333', size: 18 }
                  : { type: 'text', text: '', color: config.textColor || '#333' };
                updateSection((s) => ({
                  config: {
                    ...(s.config || {}),
                    richContent: [...(s.config?.richContent || []), newItem],
                  },
                }));
              };

              const updateRichItem = (index, updates) => {
                const newContent = [...richContent];
                newContent[index] = { ...newContent[index], ...updates };
                updateSection((s) => ({
                  config: {
                    ...(s.config || {}),
                    richContent: newContent,
                  },
                }));
              };

              const removeRichItem = (index) => {
                const newContent = richContent.filter((_, i) => i !== index);
                updateSection((s) => ({
                  config: {
                    ...(s.config || {}),
                    richContent: newContent,
                  },
                }));
              };

              const moveRichItem = (index, direction) => {
                if ((direction === 'up' && index === 0) || (direction === 'down' && index === richContent.length - 1)) {
                  return;
                }
                const newContent = [...richContent];
                const targetIndex = direction === 'up' ? index - 1 : index + 1;
                [newContent[index], newContent[targetIndex]] = [newContent[targetIndex], newContent[index]];
                updateSection((s) => ({
                  config: {
                    ...(s.config || {}),
                    richContent: newContent,
                  },
                }));
              };

              return (
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="input-row">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={config.enabled !== false}
                        onChange={(e) =>
                          updateSection((s) => ({
                            config: {
                              ...(s.config || {}),
                              enabled: e.target.checked,
                            },
                          }))
                        }
                      />
                      <span>Ativar faixa promocional</span>
                    </label>
                  </div>
                  {config.enabled !== false && (
                    <>
                      <div style={{ marginTop: 12, marginBottom: 12 }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                          <button
                            type="button"
                            onClick={() => addRichItem('text')}
                            style={{ padding: '8px 16px', backgroundColor: '#25053c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                          >
                            + Texto
                          </button>
                          <button
                            type="button"
                            onClick={() => addRichItem('icon')}
                            style={{ padding: '8px 16px', backgroundColor: '#25053c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                          >
                            + Ícone
                          </button>
                        </div>
                        {richContent.length === 0 && (
                          <div style={{ padding: '12px', backgroundColor: '#f5f5f5', borderRadius: 4, textAlign: 'center', color: '#666' }}>
                            Clique em "+ Texto" ou "+ Ícone" para adicionar conteúdo
                          </div>
                        )}
                        {richContent.map((item, index) => (
                          <div key={index} style={{ marginBottom: 12, padding: '12px', border: '1px solid #ddd', borderRadius: 4, backgroundColor: '#fafafa' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <span style={{ fontWeight: 'bold', color: '#25053c' }}>
                                {item.type === 'icon' ? 'Ícone' : 'Texto'}
                              </span>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  type="button"
                                  onClick={() => moveRichItem(index, 'up')}
                                  disabled={index === 0}
                                  style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#666', color: 'white', border: 'none', borderRadius: 2, cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.5 : 1 }}
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveRichItem(index, 'down')}
                                  disabled={index === richContent.length - 1}
                                  style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#666', color: 'white', border: 'none', borderRadius: 2, cursor: index === richContent.length - 1 ? 'not-allowed' : 'pointer', opacity: index === richContent.length - 1 ? 0.5 : 1 }}
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeRichItem(index)}
                                  style={{ padding: '4px 8px', fontSize: 12, backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: 2, cursor: 'pointer' }}
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                            {item.type === 'text' ? (
                              <>
                                <div className="input-row" style={{ marginBottom: 8 }}>
                                  <input
                                    type="text"
                                    value={item.text || ''}
                                    onChange={(e) => updateRichItem(index, { text: e.target.value })}
                                    placeholder="Digite o texto"
                                    style={{ flex: 1 }}
                                  />
                                </div>
                                <div className="input-row">
                                  <input
                                    type="color"
                                    value={item.color || config.textColor || '#333'}
                                    onChange={(e) => updateRichItem(index, { color: e.target.value })}
                                    style={{ width: 60, height: 40 }}
                                  />
                                  <input
                                    type="text"
                                    value={item.color || config.textColor || '#333'}
                                    onChange={(e) => updateRichItem(index, { color: e.target.value })}
                                    placeholder="Cor do texto (hex)"
                                    style={{ flex: 1 }}
                                  />
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="input-row" style={{ marginBottom: 8 }}>
                                  <select
                                    value={item.icon || 'star'}
                                    onChange={(e) => updateRichItem(index, { icon: e.target.value })}
                                    style={{ flex: 1 }}
                                  >
                                    {iconOptions.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="input-row">
                                  <input
                                    type="color"
                                    value={item.color || config.textColor || '#333'}
                                    onChange={(e) => updateRichItem(index, { color: e.target.value })}
                                    style={{ width: 60, height: 40 }}
                                  />
                                  <input
                                    type="text"
                                    value={item.color || config.textColor || '#333'}
                                    onChange={(e) => updateRichItem(index, { color: e.target.value })}
                                    placeholder="Cor do ícone (hex)"
                                    style={{ flex: 1 }}
                                  />
                                </div>
                                <div className="input-row" style={{ marginTop: 8 }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span>Tamanho:</span>
                                    <input
                                      type="number"
                                      min={12}
                                      max={32}
                                      value={item.size || 18}
                                      onChange={(e) => updateRichItem(index, { size: Number(e.target.value) })}
                                      style={{ width: 80 }}
                                    />
                                  </label>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="input-row">
                        <input
                          type="color"
                          value={config.backgroundColor || '#ffffff'}
                          onChange={(e) =>
                            updateSection((s) => ({
                              config: {
                                ...(s.config || {}),
                                backgroundColor: e.target.value,
                              },
                            }))
                          }
                          style={{ width: 60, height: 40 }}
                        />
                        <input
                          type="text"
                          value={config.backgroundColor || '#ffffff'}
                          onChange={(e) =>
                            updateSection((s) => ({
                              config: {
                                ...(s.config || {}),
                                backgroundColor: e.target.value,
                              },
                            }))
                          }
                          placeholder="Cor de fundo (hex) - padrão: branco"
                          style={{ flex: 1 }}
                        />
                      </div>
                      <div className="input-row">
                        <input
                          type="url"
                          value={config.url || ''}
                          onChange={(e) =>
                            updateSection((s) => ({
                              config: {
                                ...(s.config || {}),
                                url: e.target.value || undefined,
                              },
                            }))
                          }
                          placeholder="URL de destino (opcional - deixe vazio se não quiser link)"
                        />
                      </div>
                      {config.url && (
                        <div className="input-row" style={{ marginTop: 12 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span>Cor da seta (quando houver link):</span>
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              type="color"
                              value={config.arrowColor || config.textColor || '#333'}
                              onChange={(e) =>
                                updateSection((s) => ({
                                  config: {
                                    ...(s.config || {}),
                                    arrowColor: e.target.value,
                                  },
                                }))
                              }
                              style={{ width: 60, height: 40 }}
                            />
                            <input
                              type="text"
                              value={config.arrowColor || config.textColor || '#333'}
                              onChange={(e) =>
                                updateSection((s) => ({
                                  config: {
                                    ...(s.config || {}),
                                    arrowColor: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Cor da seta (hex) - padrão: mesma cor do texto"
                              style={{ flex: 1 }}
                            />
                          </div>
                        </div>
                      )}
                      <small style={{ opacity: 0.7, display: 'block', marginTop: 8 }}>
                        A faixa promocional aparecerá logo abaixo do banner principal na página inicial. Use o editor acima para criar texto com cores diferentes e adicionar ícones.
                      </small>
                    </>
                  )}
                </div>
              );
            }

            if (section.section_type === 'oferta_do_dia') {
              const config = section.config || {};
              return (
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="input-row">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={config.enabled !== false}
                        onChange={(e) =>
                          updateSection((s) => ({
                            config: {
                              ...(s.config || {}),
                              enabled: e.target.checked,
                            },
                          }))
                        }
                      />
                      <span>Ativar Oferta do Dia</span>
                    </label>
                  </div>
                  {config.enabled !== false && (
                    <>
                      <div className="input-row" style={{ marginTop: 12 }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                          Buscar Produto:
                        </label>
                        <ProductSearchInput
                          value={config.productId}
                          onChange={(productId) => {
                            console.log('🎯 [Dashboard] ProductSearchInput onChange chamado com productId:', productId);
                            updateSection((s) => {
                              const newConfig = {
                                ...(s.config || {}),
                                productId: productId,
                              };
                              console.log('💾 [Dashboard] Atualizando seção com config:', JSON.stringify(newConfig, null, 2));
                              return {
                                config: newConfig,
                              };
                            });
                          }}
                          baseURL={baseURL}
                        />
                      </div>
                      <div className="input-row" style={{ marginTop: 12 }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                          ID do Produto (preenchido automaticamente):
                        </label>
                        <input
                          type="text"
                          value={config.productId || ''}
                          onChange={(e) =>
                            updateSection((s) => ({
                              config: {
                                ...(s.config || {}),
                                productId: e.target.value ? Number(e.target.value) : undefined,
                              },
                            }))
                          }
                          placeholder="Ou digite o ID do produto manualmente"
                          style={{ width: '100%', padding: '8px' }}
                        />
                      </div>
                      <div className="input-row" style={{ marginTop: 12 }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                          Preço Cortado (opcional):
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={config.precoCortado || ''}
                          onChange={(e) =>
                            updateSection((s) => ({
                              config: {
                                ...(s.config || {}),
                                precoCortado: e.target.value ? parseFloat(e.target.value) : undefined,
                              },
                            }))
                          }
                          placeholder="Ex: 131.48 (preço original antes do desconto)"
                          style={{ width: '100%', padding: '8px' }}
                        />
                      </div>
                      <div className="input-row" style={{ marginTop: 12 }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                          Título da Seção:
                        </label>
                        <input
                          type="text"
                          value={config.tituloSecao || 'Oferta do Dia'}
                          onChange={(e) =>
                            updateSection((s) => ({
                              config: {
                                ...(s.config || {}),
                                tituloSecao: e.target.value || 'Oferta do Dia',
                              },
                            }))
                          }
                          placeholder="Ex: Oferta do Dia"
                          style={{ width: '100%', padding: '8px' }}
                        />
                      </div>
                      <div className="input-row" style={{ marginTop: 12 }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                          Texto do Badge:
                        </label>
                        <input
                          type="text"
                          value={config.badgeTexto || 'OFERTA ESPECIAL'}
                          onChange={(e) =>
                            updateSection((s) => ({
                              config: {
                                ...(s.config || {}),
                                badgeTexto: e.target.value || 'OFERTA ESPECIAL',
                              },
                            }))
                          }
                          placeholder="Ex: OFERTA ESPECIAL"
                          style={{ width: '100%', padding: '8px' }}
                        />
                      </div>
                      <div className="input-row" style={{ marginTop: 12 }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                          Cor do Badge:
                        </label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="color"
                            value={config.badgeCor || '#FF6B35'}
                            onChange={(e) =>
                              updateSection((s) => ({
                                config: {
                                  ...(s.config || {}),
                                  badgeCor: e.target.value,
                                },
                              }))
                            }
                            style={{ width: '60px', height: '40px', cursor: 'pointer' }}
                          />
                          <input
                            type="text"
                            value={config.badgeCor || '#FF6B35'}
                            onChange={(e) =>
                              updateSection((s) => ({
                                config: {
                                  ...(s.config || {}),
                                  badgeCor: e.target.value || '#FF6B35',
                                },
                              }))
                            }
                            placeholder="#FF6B35"
                            style={{ flex: 1, padding: '8px' }}
                          />
                        </div>
                      </div>
                      <div className="input-row" style={{ marginTop: 12 }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                          Cor do Valor Normal:
                        </label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="color"
                            value={config.precoNormalCor || '#FF6B35'}
                            onChange={(e) =>
                              updateSection((s) => ({
                                config: {
                                  ...(s.config || {}),
                                  precoNormalCor: e.target.value,
                                },
                              }))
                            }
                            style={{ width: '60px', height: '40px', cursor: 'pointer' }}
                          />
                          <input
                            type="text"
                            value={config.precoNormalCor || '#FF6B35'}
                            onChange={(e) =>
                              updateSection((s) => ({
                                config: {
                                  ...(s.config || {}),
                                  precoNormalCor: e.target.value || '#FF6B35',
                                },
                              }))
                            }
                            placeholder="#FF6B35"
                            style={{ flex: 1, padding: '8px' }}
                          />
                        </div>
                      </div>
                      <small style={{ opacity: 0.7, display: 'block', marginTop: 8 }}>
                        Busque o produto pelo nome no campo acima ou digite o ID do produto diretamente. O ID será preenchido automaticamente ao selecionar um produto da busca. O preço cortado será exibido riscado acima do preço atual. O título da seção aparecerá na home screen acima do card do produto. O badge aparecerá na página de detalhes do produto abaixo do nome.
                      </small>
                    </>
                  )}
                </div>
              );
            }

            if (section.section_type === 'banner-grid') {
              const height = section.config?.height || 180;
              return (
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="input-row">
                    <input
                      value={section.title || ''}
                      onChange={(e) =>
                        updateSection(() => ({
                          title: e.target.value,
                        }))
                      }
                      placeholder="Título da seção (opcional)"
                    />
                  </div>
                  <div className="input-row">
                    <input
                      type="number"
                      min={80}
                      value={height}
                      onChange={(e) => {
                        const value = e.target.value ? Number(e.target.value) : 0;
                        updateSection((s) => ({
                          config: {
                            ...(s.config || {}),
                            height: value,
                          },
                        }));
                      }}
                      placeholder="Altura em pixels (ex: 180)"
                    />
                  </div>
                  <div className="input-row" style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      placeholder="URL da imagem (https://...)"
                      style={{ flex: 1 }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          const newImage = {
                            id: `img-${Date.now()}`,
                            url: e.target.value.trim(),
                          };
                          const updatedSections = sections.map((s) =>
                            s.id === section.id
                              ? {
                                  ...s,
                                  config: {
                                    ...(s.config || {}),
                                    images: [...(s.config?.images || []), newImage],
                                  },
                                }
                              : s
                          );
                          setSections(updatedSections);
                          e.target.value = '';
                          onSaveLayout({
                            sections: updatedSections,
                            banners,
                            metadata,
                          });
                        }
                      }}
                    />
                    <button
                      className="secondary"
                      onClick={(e) => {
                        const input = e.target.previousElementSibling;
                        if (!input.value.trim()) return;
                        const newImage = {
                          id: `img-${Date.now()}`,
                          url: input.value.trim(),
                        };
                        const updatedSections = sections.map((s) =>
                          s.id === section.id
                            ? {
                                ...s,
                                config: {
                                  ...(s.config || {}),
                                  images: [...(s.config?.images || []), newImage],
                                },
                              }
                            : s
                        );
                        setSections(updatedSections);
                        input.value = '';
                        onSaveLayout({
                          sections: updatedSections,
                          banners,
                          metadata,
                        });
                      }}
                    >
                      Adicionar URL
                    </button>
                  </div>
                  <div className="input-row" style={{ marginTop: 8 }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleSectionBannerUpload(section.id, e)}
                      disabled={uploading}
                    />
                  </div>
                  {Array.isArray(section.config?.images) && section.config.images.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {section.config.images.map((img) => {
                        const absoluteUrl =
                          img.url.startsWith('http') || img.url.startsWith('data:')
                            ? img.url
                            : `${(baseURL || '').replace(/\/api\/?$/, '').replace(/\/$/, '')}${img.url}`;
                        return (
                          <div key={img.id} style={{ width: 120, position: 'relative' }}>
                            <img
                              src={absoluteUrl}
                              alt={section.title || 'Imagem'}
                              style={{ width: '100%', borderRadius: 8, objectFit: 'cover' }}
                            />
                            <button
                              type="button"
                              className="secondary"
                              style={{
                                position: 'absolute',
                                top: 4,
                                right: 4,
                                padding: '2px 6px',
                                fontSize: 10,
                              }}
                              onClick={() => {
                                setSections((prev) =>
                                  prev.map((s) =>
                                    s.id === section.id
                                      ? {
                                          ...s,
                                          config: {
                                            ...(s.config || {}),
                                            images: (s.config?.images || []).filter(
                                              (i) => i.id !== img.id
                                            ),
                                          },
                                        }
                                      : s
                                  )
                                );
                              }}
                            >
                              x
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                    A largura no app será sempre <strong>100% da tela</strong>. Para melhor qualidade,
                    recomendamos enviar imagens com largura de ~<strong>800–1080px</strong> e a mesma
                    altura definida acima (mantendo a proporção).
                  </p>
                </div>
              );
            }

            return (
              <div className="card" style={{ marginTop: 8 }}>
                <p style={{ margin: 0, opacity: 0.7 }}>
                  Esta seção não possui configurações específicas no momento.
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {selectedSection && selectedSection.section_type === 'hero' && (
        <div style={{ marginTop: 20 }}>
          <h3>Banners do hero</h3>
          <input type="file" accept="image/*" onChange={handleBannerUpload} disabled={uploading} />
          {uploading && <small>Enviando...</small>}
          <div className="banner-preview">
            {banners.map((banner, index) => (
              <div key={banner.id} className="banner-card">
                <strong>{banner.title || `Banner ${index + 1}`}</strong>
                <small style={{ display: 'block', opacity: 0.7 }}>{banner.variant}</small>
                <input
                  style={{ marginTop: 6, width: '100%' }}
                  placeholder="URL da imagem (https://...)"
                  value={banner.imageUrl || ''}
                  onChange={(e) => {
                    const newBanners = banners.map((b, i) =>
                      i === index ? { ...b, imageUrl: e.target.value } : b
                    );
                    setBanners(newBanners);
                    // Salvar automaticamente quando a URL é alterada
                    onSaveLayout({
                      sections,
                      banners: newBanners,
                      metadata,
                    });
                  }}
                />
                {banner.imageUrl ? (
                  <img
                    src={banner.imageUrl}
                    alt={banner.title}
                    style={{ width: '100%', borderRadius: 8, marginTop: 8 }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: 80,
                      borderRadius: 8,
                      marginTop: 8,
                      background:
                        'repeating-linear-gradient(135deg, #f3f4f6, #f3f4f6 6px, #e5e7eb 6px, #e5e7eb 12px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      color: '#6b7280',
                    }}
                  >
                    Sem imagem (usando banner local do app)
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Destino ao clicar (opcional)
                  </label>
                  <select
                    style={{ width: '100%', padding: 6, fontSize: 12, marginBottom: 6 }}
                    value={banner.destinationType || ''}
                    onChange={(e) => {
                      const newBanners = banners.map((b, i) =>
                        i === index ? { ...b, destinationType: e.target.value || null, destinationValue: e.target.value ? (b.destinationValue || '') : null } : b
                      );
                      setBanners(newBanners);
                      onSaveLayout({ sections, banners: newBanners, metadata });
                    }}
                  >
                    <option value="">Nenhum (apenas navegar banner)</option>
                    <option value="collection">Coleção</option>
                    <option value="category">Categoria</option>
                    <option value="product">Produto</option>
                    <option value="screen">Tela do App</option>
                  </select>
                  {banner.destinationType && (
                    <input
                      style={{ width: '100%', padding: 6, fontSize: 12, marginTop: 4 }}
                      placeholder={
                        banner.destinationType === 'collection' ? 'ID ou handle da coleção' :
                        banner.destinationType === 'category' ? 'Nome da categoria' :
                        banner.destinationType === 'product' ? 'ID do produto' :
                        banner.destinationType === 'screen' ? 'Nome da tela (ex: Cart, Favorites)' :
                        'Valor do destino'
                      }
                      value={banner.destinationValue || ''}
                      onChange={(e) => {
                        const newBanners = banners.map((b, i) =>
                          i === index ? { ...b, destinationValue: e.target.value } : b
                        );
                        setBanners(newBanners);
                        onSaveLayout({ sections, banners: newBanners, metadata });
                      }}
                    />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    className="secondary"
                    style={{ flex: 1 }}
                    onClick={() => moveBanner(index, index - 1)}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    className="secondary"
                    style={{ flex: 1 }}
                    onClick={() => moveBanner(index, index + 1)}
                    disabled={index === banners.length - 1}
                  >
                    ↓
                  </button>
                </div>
                <button
                  className="secondary"
                  style={{ width: '100%', marginTop: 6 }}
                  onClick={() => setBanners((prev) => prev.filter((b) => b.id !== banner.id))}
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <h3>Metadata</h3>
        <div className="input-row">
          <input
            value={metadata.heroLayout || ''}
            onChange={(e) => setMetadata((prev) => ({ ...prev, heroLayout: e.target.value }))}
            placeholder="Hero layout (ex: full-bleed)"
          />
          <input
            value={metadata.theme || ''}
            onChange={(e) => setMetadata((prev) => ({ ...prev, theme: e.target.value }))}
            placeholder="Tema"
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button className="primary" onClick={handleSave} disabled={saving}>
          Salvar rascunho
        </button>
        <button className="secondary" onClick={() => onPublish(currentPayload)} disabled={saving}>
          Publicar
        </button>
      </div>

      {/* Preview interativa da home, espelhando o layout atual antes de salvar/publicar */}
      <HomePreview sections={sections} banners={banners} metadata={metadata} baseURL={baseURL} />
    </div>
  );
};

export default TemplateEditor;


