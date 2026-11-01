// Demonstração do componente bento (rota /stack, fora do menu).
// Atenção: os números do componente são simulados (aleatórios), não vêm do VL Command.
import TechStackBento from '@/components/ui/interactive-tech-stack-bento-grid-with-hover-effects';

export default function DemoOne() {
  return (
    <div className="tw">
      <TechStackBento />
    </div>
  );
}
