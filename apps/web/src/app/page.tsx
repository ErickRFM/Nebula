import { NebulaApp } from '../components/NebulaApp';
import { ConfirmProvider } from '../hooks/useConfirm';

export default function HomePage() {
  return <ConfirmProvider><NebulaApp /></ConfirmProvider>;
}
