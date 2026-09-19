import { JewelryViewer } from './components/JewelryViewer';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <main className="w-full h-screen bg-black overflow-hidden">
      <ErrorBoundary>
        <JewelryViewer />
      </ErrorBoundary>
    </main>
  );
}
