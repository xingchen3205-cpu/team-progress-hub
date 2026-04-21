export default function TabSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-6 w-1/3 rounded bg-gray-200" />
      <div className="h-4 w-2/3 rounded bg-gray-200" />
      <div className="h-4 w-1/2 rounded bg-gray-200" />
      <div className="h-32 rounded bg-gray-200" />
    </div>
  );
}
