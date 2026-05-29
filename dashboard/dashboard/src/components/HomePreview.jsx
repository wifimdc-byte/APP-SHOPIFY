import { useMemo, useState, useEffect } from 'react';

const buildAbsoluteUrl = (url, baseURL) => {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  const fileBase = (baseURL || '').replace(/\/api\/?$/, '').replace(/\/$/, '');
  return `${fileBase}${url}`;
};

const HomePreview = ({ sections, banners, metadata, baseURL }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const safeBanners = useMemo(() => banners || [], [banners]);
  const activeBanner = safeBanners[activeIndex] || safeBanners[0];

  // Debug: log dos banners recebidos
  useEffect(() => {
    if (safeBanners.length > 0) {
      console.log('📸 [HomePreview] Banners recebidos:', safeBanners.map(b => ({ id: b.id, title: b.title, imageUrl: b.imageUrl })));
      console.log('📸 [HomePreview] Banner ativo:', activeBanner);
      console.log('📸 [HomePreview] URL construída:', activeBanner?.imageUrl ? buildAbsoluteUrl(activeBanner.imageUrl, baseURL) : 'sem URL');
    }
  }, [safeBanners, activeBanner, baseURL]);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2 style={{ marginBottom: 12 }}>Preview da Home (mock web)</h2>
      <div
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          background: '#0b1120',
          border: '1px solid rgba(148, 163, 184, 0.4)',
        }}
      >
        {/* Hero banner em slide */}
        {activeBanner ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              paddingTop: '42%',
              backgroundColor: '#020617',
            }}
          >
            {activeBanner.imageUrl ? (
              <img
                src={buildAbsoluteUrl(activeBanner.imageUrl, baseURL)}
                alt={activeBanner.title}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
                onError={(e) => {
                  console.error('Erro ao carregar imagem do banner:', buildAbsoluteUrl(activeBanner.imageUrl, baseURL));
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  fontSize: 13,
                }}
              >
                Sem imagem configurada
              </div>
            )}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                background:
                  'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0.1) 40%, transparent)',
                color: '#fff',
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.9 }}>
                {metadata?.heroLayout || 'Banner principal'}
              </div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{activeBanner.title || 'Banner'}</div>
              {activeBanner.subtitle && (
                <div style={{ fontSize: 13, opacity: 0.9 }}>{activeBanner.subtitle}</div>
              )}
            </div>

            {/* Indicadores + setas */}
            {safeBanners.length > 1 && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    bottom: 10,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {safeBanners.map((b, idx) => (
                    <button
                      key={b.id || idx}
                      onClick={() => setActiveIndex(idx)}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        backgroundColor:
                          idx === activeIndex ? '#f9fafb' : 'rgba(148,163,184,0.6)',
                        opacity: idx === activeIndex ? 1 : 0.7,
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setActiveIndex((prev) =>
                      prev - 1 < 0 ? safeBanners.length - 1 : prev - 1
                    )
                  }
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: 10,
                    transform: 'translateY(-50%)',
                    borderRadius: '999px',
                    border: 'none',
                    padding: '4px 8px',
                    background: 'rgba(15,23,42,0.7)',
                    color: '#e5e7eb',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveIndex((prev) => (prev + 1) % safeBanners.length)
                  }
                  style={{
                    position: 'absolute',
                    top: '50%',
                    right: 10,
                    transform: 'translateY(-50%)',
                    borderRadius: '999px',
                    border: 'none',
                    padding: '4px 8px',
                    background: 'rgba(15,23,42,0.7)',
                    color: '#e5e7eb',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  ›
                </button>
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: '#6b7280',
              fontSize: 13,
              borderBottom: '1px dashed rgba(148,163,184,0.6)',
            }}
          >
            Nenhum banner principal configurado ainda.
          </div>
        )}

        {/* Não precisamos mais de layout secundário fixo para banners aqui;
            o slide acima já representa a experiência principal. */}
        <div style={{ padding: 16 }}>

          {/* Seções */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sections?.map((section) => (
              <div
                key={section.id || section.section_key}
                style={{
                  borderRadius: 12,
                  padding: 10,
                  background: '#ffffff',
                  border: '1px solid rgba(209,213,219,0.9)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{section.title}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {section.section_type === 'hero'
                        ? 'Carrossel de banners (slide automático)'
                        : section.section_type === 'featured'
                        ? 'Seção destaque (carrossel horizontal)'
                        : section.section_type === 'collection'
                        ? 'Grade de produtos por coleção'
                        : section.section_type === 'special_cards'
                        ? 'Carrossel de cards especiais (carrinho, favorito, etc.)'
                        : 'Seção personalizada'}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'rgba(109,40,217,0.08)',
                      color: '#6d28d9',
                    }}
                  >
                    key: {section.section_key}
                  </div>
                </div>

                {section.section_type === 'special_cards' && Array.isArray(section.config?.cards) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {section.config.cards.map((cardKey) => (
                      <span
                        key={cardKey}
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid rgba(59,130,246,0.4)',
                        }}
                      >
                        {cardKey === 'cart'
                          ? 'Compre seu carrinho'
                          : cardKey === 'recently_viewed'
                          ? 'Visto recentemente'
                          : cardKey === 'favorite'
                          ? 'Compre seu favorito'
                          : cardKey === 'store'
                          ? 'Loja mais perto de você'
                          : cardKey === 'whatsapp'
                          ? 'Dúvidas? WhatsApp'
                          : cardKey}
                      </span>
                    ))}
                  </div>
                )}

                {section.section_type === 'banner-grid' && (
                  <div style={{ marginTop: 8 }}>
                    {Array.isArray(section.config?.images) && section.config.images.length > 0 ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {section.config.images.map((img) => {
                          const imgUrl = buildAbsoluteUrl(img.url, baseURL);
                          return (
                            <div
                              key={img.id}
                              style={{
                                width: '100%',
                                maxWidth: 300,
                                borderRadius: 8,
                                overflow: 'hidden',
                                border: '1px solid rgba(209,213,219,0.5)',
                              }}
                            >
                              <img
                                src={imgUrl}
                                alt={section.title || 'Banner'}
                                style={{
                                  width: '100%',
                                  height: section.config?.height || 180,
                                  objectFit: 'cover',
                                }}
                                onError={(e) => {
                                  console.error('Erro ao carregar imagem do banner-grid:', imgUrl);
                                  e.target.style.display = 'none';
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: 16,
                          textAlign: 'center',
                          color: '#9ca3af',
                          fontSize: 12,
                          border: '1px dashed rgba(209,213,219,0.7)',
                          borderRadius: 8,
                        }}
                      >
                        Nenhuma imagem configurada
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(!sections || sections.length === 0) && (
              <div
                style={{
                  borderRadius: 12,
                  padding: 10,
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#6b7280',
                  border: '1px dashed rgba(148,163,184,0.7)',
                }}
              >
                Nenhuma seção configurada ainda. Adicione seções no editor para ver como a home ficará.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePreview;


