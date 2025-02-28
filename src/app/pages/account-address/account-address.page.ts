import { ClipboardService, DeeplinkService, QRType, UiEventService } from '@airgap/angular-core'
import { AirGapWallet, IACMessageDefinitionObjectV3, MainProtocolSymbols } from '@airgap/coinlib-core'
import { Component, ViewChild } from '@angular/core'
import { Router } from '@angular/router'
import { IonModal, PopoverController } from '@ionic/angular'

import { ErrorCategory, handleErrorLocal } from '../../services/error-handler/error-handler.service'
import { InteractionOperationType, InteractionService } from '../../services/interaction/interaction.service'
import { MigrationService } from '../../services/migration/migration.service'
import { NavigationService } from '../../services/navigation/navigation.service'
import { ShareUrlService } from '../../services/share-url/share-url.service'
import { isWalletMigrated } from '../../utils/migration'

import { AccountEditPopoverComponent } from './account-edit-popover/account-edit-popover.component'

// TODO: add wallet definition into a service
export const airgapwallet = {
  icon: 'airgap-wallet-app-logo.png',
  name: 'AirGap Wallet',
  qrType: QRType.V3
}

const bluewallet = {
  icon: 'bluewallet.png',
  name: 'BlueWallet',
  qrType: QRType.BC_UR
}

const sparrowwallet = {
  icon: 'sparrowwallet.png',
  name: 'Sparrow Wallet',
  qrType: QRType.BC_UR
}

const metamask = {
  icon: 'metamask.webp',
  name: 'MetaMask',
  qrType: QRType.METAMASK
}

export interface CompanionApp {
  icon: string
  name: string
  qrType: QRType
}

@Component({
  selector: 'airgap-account-address',
  templateUrl: './account-address.page.html',
  styleUrls: ['./account-address.page.scss']
})
export class AccountAddressPage {
  @ViewChild(IonModal) modal: IonModal

  public wallet: AirGapWallet

  public syncOptions: CompanionApp[]

  private shareObject?: IACMessageDefinitionObjectV3[]
  private shareObjectPromise?: Promise<void>
  private walletShareUrl?: string

  presentingElement = null

  constructor(
    private readonly popoverCtrl: PopoverController,
    private readonly clipboardService: ClipboardService,
    private readonly shareUrlService: ShareUrlService,
    private readonly interactionService: InteractionService,
    private readonly navigationService: NavigationService,
    private readonly uiEventService: UiEventService,
    private readonly migrationService: MigrationService,
    private readonly deepLinkService: DeeplinkService,
    private readonly router: Router
  ) {
    this.wallet = this.navigationService.getState().wallet

    if (!this.wallet) {
      this.router.navigate(['/'])
      throw new Error('No wallet found!')
    }

    switch (this.wallet?.protocol.identifier) {
      case MainProtocolSymbols.BTC_SEGWIT:
        this.syncOptions = [airgapwallet, bluewallet, sparrowwallet]
        break
      case MainProtocolSymbols.ETH:
        this.syncOptions = [airgapwallet, metamask]
        break
      default:
        this.syncOptions = [airgapwallet]
    }
  }

  ngOnInit() {
    this.presentingElement = document.querySelector('.ion-page')
  }

  public done(): void {
    this.navigationService.routeToAccountsTab().catch(handleErrorLocal(ErrorCategory.IONIC_NAVIGATION))
  }

  public async share(companionApp: CompanionApp = airgapwallet): Promise<void> {
    await this.waitWalletShareUrl()

    this.interactionService.startInteraction({
      operationType: InteractionOperationType.WALLET_SYNC,
      iacMessage: this.shareObject,
      companionApp: companionApp
    })
  }

  public async presentEditPopover(event: Event): Promise<void> {
    const popover: HTMLIonPopoverElement = await this.popoverCtrl.create({
      component: AccountEditPopoverComponent,
      componentProps: {
        wallet: this.wallet,
        openAddressQR: () => {
          this.modal.present().catch(handleErrorLocal(ErrorCategory.IONIC_MODAL))
        },
        getWalletShareUrl: async () => {
          await this.waitWalletShareUrl()
          return this.walletShareUrl
        },
        onDelete: (): void => {
          this.navigationService.back()
        }
      },
      event,
      translucent: true
    })

    return popover.present().catch(handleErrorLocal(ErrorCategory.IONIC_ALERT))
  }

  public async copyAddressToClipboard(): Promise<void> {
    await this.clipboardService.copyAndShowToast(this.wallet.receivingPublicAddress)
  }

  private async waitWalletShareUrl() {
    await this.prepareSyncObject()
    this.walletShareUrl = await this.deepLinkService.generateDeepLinkUrl(this.shareObject)
  }

  private async prepareSyncObject(): Promise<void> {
    if (this.shareObject !== undefined) {
      return
    }

    await this.migrationService.runWalletsMigration([this.wallet])
    if (!isWalletMigrated(this.wallet)) {
      await this.showWalletNotMigratedAlert()

      return Promise.reject('Cannot create share URL, wallet data is incomplete')
    }

    if (this.shareObjectPromise === undefined) {
      this.shareObjectPromise = new Promise<IACMessageDefinitionObjectV3[]>(async (resolve) => {
        const shareObject: IACMessageDefinitionObjectV3[] = await this.shareUrlService.generateShareWalletURL(this.wallet)
        resolve(shareObject)
      }).then((shareObject: IACMessageDefinitionObjectV3[]) => {
        this.shareObject = shareObject
        this.shareObjectPromise = undefined
      })
    }

    return this.shareObjectPromise
  }

  private async showWalletNotMigratedAlert(): Promise<void> {
    return this.uiEventService.showTranslatedAlert({
      header: 'wallet-address.alert.wallet-not-migrated.header',
      message: 'wallet-address.alert.wallet-not-migrated.message',
      buttons: [
        {
          text: 'wallet-address.alert.wallet-not-migrated.button_label'
        }
      ]
    })
  }
}
