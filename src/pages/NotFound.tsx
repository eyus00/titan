import { Link } from 'react-router';
import { btn } from '../components/Button';
import { useTitle } from '../lib/util';

export default function NotFound({ what = 'page' }: { what?: 'page' | 'set' }) {
  useTitle('Not found');
  return (
    <div className="flex flex-1 flex-col items-start justify-center pb-[12vh]">
      <p className="label-mono text-muted">404</p>
      <h1 className="mt-2 font-serif text-5xl leading-none tracking-[-0.01em]">Nothing here.</h1>
      <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-pretty text-muted">
        {what === 'set' ? 'This set is not in this browser. Sets are saved on the device they were made on.' : "That page doesn't exist."}
      </p>
      <Link to="/" className={btn({ variant: 'primary' }) + ' mt-7'}>
        Back to your sets
      </Link>
    </div>
  );
}
