import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { StoryEngineProvider } from "./providers/StoryEngineProvider";

export function App() {
  return (
    <StoryEngineProvider>
      <RouterProvider router={router} />
    </StoryEngineProvider>
  );
}
