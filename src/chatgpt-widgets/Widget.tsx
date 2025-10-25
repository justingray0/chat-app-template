import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useDisplayMode,
  useMaxHeight,
  useWidgetProps,
  useWidgetState,
} from '@/hooks';
import { Button } from '@/components/ui/button';

interface WidgetProps extends Record<string, unknown> {
  message?: string;
}

interface WidgetStateType extends Record<string, unknown> {
  count: number;
}

export default function Widget() {
  const displayMode = useDisplayMode();
  const maxHeight = useMaxHeight();
  const props = useWidgetProps<WidgetProps>();
  const [widgetState, setWidgetState] = useWidgetState<WidgetStateType>({
    count: 0,
  });

  const handleIncrement = () => {
    setWidgetState((prev) => (prev ? { count: prev.count + 1 } : { count: 1 }));
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>ChatGPT Widget Example</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium">Display Mode:</p>
          <p className="text-sm text-gray-600">
            {displayMode || 'Not available'}
          </p>
        </div>

        <div>
          <p className="text-sm font-medium">Max Height:</p>
          <p className="text-sm text-gray-600">
            {maxHeight ? `${maxHeight}px` : 'Not available'}
          </p>
        </div>

        <div>
          <p className="text-sm font-medium">Props Message:</p>
          <p className="text-sm text-gray-600">
            {props?.message || 'No message'}
          </p>
        </div>

        <div>
          <p className="text-sm font-medium">Widget State Count:</p>
          <p className="text-sm text-gray-600">{widgetState?.count || 0}</p>
          <Button onClick={handleIncrement} className="mt-2">
            Increment
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
