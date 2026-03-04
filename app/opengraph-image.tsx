import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const contentType = 'image/png'
export const size = { width: 1200, height: 630 }

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1200px',
          height: '630px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Cercles décoratifs */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            right: '-100px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'rgba(59, 130, 246, 0.08)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-80px',
            left: '-80px',
            width: '350px',
            height: '350px',
            borderRadius: '50%',
            background: 'rgba(245, 158, 11, 0.06)',
          }}
        />

        {/* Logo text */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              fontWeight: 'bold',
              color: 'white',
            }}
          >
            Q
          </div>
          <span
            style={{
              fontSize: '52px',
              fontWeight: '800',
              color: 'white',
              letterSpacing: '-1px',
            }}
          >
            Qadhya
          </span>
        </div>

        {/* Tagline */}
        <p
          style={{
            fontSize: '26px',
            color: '#94a3b8',
            textAlign: 'center',
            maxWidth: '700px',
            lineHeight: 1.4,
            margin: '0 0 32px 0',
          }}
        >
          Assistant Juridique IA pour Avocats Tunisiens
        </p>

        {/* Badges */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
          }}
        >
          {['IA Juridique RAG', 'Droit Tunisien', 'Gestion Cabinet'].map((badge) => (
            <div
              key={badge}
              style={{
                padding: '8px 20px',
                borderRadius: '100px',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#93c5fd',
                fontSize: '18px',
                fontWeight: '500',
              }}
            >
              {badge}
            </div>
          ))}
        </div>

        {/* URL bas */}
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            color: '#475569',
            fontSize: '18px',
          }}
        >
          qadhya.tn
        </div>
      </div>
    ),
    { ...size }
  )
}
