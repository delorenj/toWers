import { useMarketStore } from '../store/marketStore';
import { ServiceMarketplace } from '../components/market/ServiceMarketplace';
import { ServiceDetails } from '../components/market/ServiceDetails';


export function MarketPage() {
    const {
        selectedService,
        selectService,
        clearSelectedService
    } = useMarketStore();

    // View service details
    const viewServiceDetails = (serviceId: string) => {
        selectService(serviceId);
    };

    // Go back to marketplace
    const goBackToMarketplace = () => {
        clearSelectedService();
    };

    // Display different components based on whether a service is selected
    return (
        <div className="w-full">
            {selectedService ? (
                <ServiceDetails onBack={goBackToMarketplace} />
            ) : (
                <ServiceMarketplace onSelectService={viewServiceDetails} />
            )}
        </div>
    );
} 