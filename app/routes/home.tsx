import type { Route } from "./+types/home";
import BBTTracker from "./bbt-tracker";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Fertility Tracker" },
    { name: "description", content: "Welcome to Fertility Tracker!" },
  ];
}

export default function Home() {
  return <BBTTracker/>;
}
