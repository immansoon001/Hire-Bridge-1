import axios from "axios";
import { useAuth } from "@clerk/clerk-react";
import { useMemo } from "react";

const getApiBaseUrl = () => {
  const raw = import.meta.env.VITE_API_URL;
  if (!raw) return "/api";
  const clean = raw.trim().replace(/\/+$/, "");
  return clean.endsWith("/api") ? clean : `${clean}/api`;
};

const axiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
});

// Hook that returns an axios instance with the Clerk Bearer token attached.
// Use this inside React components/hooks instead of importing axiosInstance directly.
export const useAxiosWithAuth = () => {
  const { getToken } = useAuth();

  const authAxios = useMemo(() => {
    const instance = axios.create({
      baseURL: getApiBaseUrl(),
      withCredentials: true,
    });

    instance.interceptors.request.use(async (config) => {
      try {
        const token = await getToken();
        if (token) {
          if (config.headers && typeof config.headers.set === "function") {
            config.headers.set("Authorization", `Bearer ${token}`);
          } else {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
      } catch (err) {
        console.error("Error retrieving Clerk token:", err);
      }
      return config;
    });

    return instance;
  }, [getToken]);

  return authAxios;
};

export default axiosInstance;
