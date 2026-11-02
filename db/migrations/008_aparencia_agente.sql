-- Personalização visual dos agentes no escritório 3D: { "luz": "#rrggbb", "corpo": "#rrggbb" }.
ALTER TABLE agente ADD COLUMN aparencia jsonb NOT NULL DEFAULT '{}';
