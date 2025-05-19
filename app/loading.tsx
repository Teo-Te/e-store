import Image from "next/image";
import loader from "@/assets/loader.gif";

const Loading = () => {
  return (
    <div className="flex justify-center items-center h-screen w-screen">
      <Image
        src={loader}
        height={150}
        width={150}
        unoptimized
        alt="Loading..."
      ></Image>
    </div>
  );
};

export default Loading;
